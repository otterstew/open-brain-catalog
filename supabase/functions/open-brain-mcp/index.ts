import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { Hono } from "hono";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY")!;
const MCP_ACCESS_KEY = Deno.env.get("MCP_ACCESS_KEY")!;

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ThoughtMatch = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
  created_at: string;
};

type ThoughtRecord = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at?: string | null;
};

const CITATION_BASE_URL =
  Deno.env.get("OPEN_BRAIN_CITATION_BASE_URL") || "https://openbrain.local/thoughts";

// The controlled vocabulary lives in public.topic_vocabulary and nowhere else.
//
// It used to live in two places — topics.txt at the archive project's root, and
// a hardcoded list right here — and the comment that stood in this spot was a
// warning about it: the copies drift, the drift is invisible, and the remedy
// was to remember to run a checker after every change and paste a block back.
// Nobody remembers that. Adding a topic is now one INSERT and takes effect on
// the next capture.
//
// topics.txt is gone, and with it tidy-archive.py, which read it to fold tags
// on the Mac. The nightly tidy_thought_tags job does that work in the database
// now — over every note rather than whatever was on that disk, whether the Mac
// is awake or not, and writing what it changed to topic_tidy_log so it can be
// undone. Two things folding tags to two different lists is the drift this
// whole arrangement exists to end, so there is exactly one now, and it is not
// on anybody's laptop. The topic_vocabulary tool below is for reading the list
// from outside the database; nothing out there writes tags any more.
type Vocabulary = { preferred: string[]; collection: string[] };

// Per isolate, briefly. Edge function isolates are short-lived, so this is at
// most one small query a minute per live isolate, and an edit shows up in the
// prompt within the minute rather than at the next deploy.
const VOCAB_TTL_MS = 60_000;
let vocabCache: Vocabulary | null = null;
let vocabFetchedAt = 0;

async function loadVocabulary(): Promise<Vocabulary> {
  if (vocabCache && Date.now() - vocabFetchedAt < VOCAB_TTL_MS) return vocabCache;

  const { data, error } = await supabase
    .from("topic_vocabulary")
    .select("topic, kind")
    .order("position", { ascending: true })
    .order("topic", { ascending: true });

  if (error || !data) {
    // Stale beats empty. An empty vocabulary silently turns the extractor loose
    // to coin a fresh tag for everything, which is the exact drift this table
    // exists to stop, and nothing would look broken until the tags were a mess
    // again. Serving the last known good list keeps captures correct through a
    // blip; only a cold isolate that has never read the table gets nothing.
    console.warn("topic_vocabulary unavailable, using cached list:", error?.message);
    return vocabCache || { preferred: [], collection: [] };
  }

  const rows = data as { topic: string; kind: string }[];
  vocabCache = {
    preferred: rows.filter((r) => r.kind === "preferred").map((r) => r.topic),
    collection: rows.filter((r) => r.kind === "collection").map((r) => r.topic),
  };
  vocabFetchedAt = Date.now();
  return vocabCache;
}

// "Reading", "Work" or "Projects" — the prompt reads better than a bare list.
function quotedList(items: string[]): string {
  const quoted = items.map((t) => `"${t}"`);
  if (quoted.length < 2) return quoted.join("");
  return quoted.slice(0, -1).join(", ") + " or " + quoted[quoted.length - 1];
}


// Prefer the note's real title. The extractor writes metadata.title on capture,
// so a slice of the content is only ever a fallback for notes that predate it or
// where extraction failed. Returning "8/18/2026 - # --- title: \"OB1 Agent..." when
// a perfectly good title exists makes every search result unreadable and forces a
// full fetch just to find out what a note is.
function thoughtTitle(
  content: string,
  createdAt?: string,
  metadata?: Record<string, unknown> | null
): string {
  const declared = typeof metadata?.title === "string" ? metadata.title.trim() : "";
  if (declared) return declared;

  const firstLine = content.replace(/\s+/g, " ").trim().slice(0, 80);
  const datePrefix = createdAt ? new Date(createdAt).toLocaleDateString() : "Open Brain";
  return firstLine ? `${datePrefix} - ${firstLine}` : `${datePrefix} thought`;
}

// A one-line-per-note rendering: enough to decide whether a note is the one you
// want, without paying for its body. list_thoughts and search_thoughts return the
// full text of every match, which for 20 notes runs past half a million characters
// and cannot be read by any client. Use fetch (optionally with max_chars) once the
// right note has been identified.
const SNIPPET_CHARS = 200;

function compactThought(
  t: {
    id: string;
    content: string;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    similarity?: number;
  },
  index: number
): string {
  const m = t.metadata || {};
  const head = [`${index + 1}. ${thoughtTitle(t.content, t.created_at, m)}`];
  if (typeof t.similarity === "number") head.push(`(${(t.similarity * 100).toFixed(1)}%)`);

  const facts: string[] = [`${m.type || "??"}`, new Date(t.created_at).toLocaleDateString()];
  if (m.author) facts.push(`by ${m.author}`);
  if (m.source_name) facts.push(`via ${m.source_name}`);
  if (Array.isArray(m.topics) && m.topics.length) facts.push((m.topics as string[]).join(", "));

  const snippet = t.content
    .replace(/^#+ /gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SNIPPET_CHARS);

  return [
    head.join(" "),
    `   ${facts.join(" | ")}`,
    `   ${snippet}${t.content.length > SNIPPET_CHARS ? "…" : ""}`,
    `   [id: ${t.id}] (${t.content.length} chars)`,
  ].join("\n");
}

function thoughtUrl(id: string): string {
  return `${CITATION_BASE_URL.replace(/\/$/, "")}/${id}`;
}

// text-embedding-3-small accepts at most 8192 tokens. Full article captures and
// prompt kits run past that, and the API rejects the whole request when they do,
// which used to fail the entire save. Embed a leading slice instead: it is more
// than enough to characterize a note for search, and the note itself is stored
// in full either way. Sized in characters with room for dense markdown, where a
// token can be as little as ~3 characters.
const EMBED_CHAR_LIMIT = 24000;

async function getEmbedding(text: string): Promise<number[]> {
  const input = text.length > EMBED_CHAR_LIMIT ? text.slice(0, EMBED_CHAR_LIMIT) : text;
  const r = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input,
    }),
  });
  if (!r.ok) {
    const msg = await r.text().catch(() => "");
    throw new Error(`OpenRouter embeddings failed: ${r.status} ${msg}`);
  }
  const d = await r.json();
  return d.data[0].embedding;
}

// Canonical full names for people the AI extractor tends to return with
// just a first name, keyed by lowercased short form. Extend this map when
// another short name needs a standing correction.
const NAME_ALIASES: Record<string, string> = {
  nate: "Nate B. Jones",
  "nate jones": "Nate B. Jones",
  "nate b jones": "Nate B. Jones",
  "nate b. jones": "Nate B. Jones",
};

// For fields that ARE a person's name outright (author, each entry in
// people) — exact (trimmed, case-insensitive) match against the alias table.
function canonicalizePersonName(name: unknown): unknown {
  if (typeof name !== "string") return name;
  const trimmed = name.trim();
  if (!trimmed) return name;
  const alias = NAME_ALIASES[trimmed.toLowerCase()];
  return alias || name;
}

// For fields that might CONTAIN a short name inside a longer string (e.g.
// source_name "Nate's Substack") — whole-word replace, skipping spots that
// already look canonicalized so re-running this is a no-op.
function canonicalizeEmbeddedNames(text: unknown): unknown {
  if (typeof text !== "string") return text;
  let result = text;
  for (const [short, full] of Object.entries(NAME_ALIASES)) {
    const escaped = short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Skip anything already followed by the rest of the name, with or without
    // the period — otherwise "Nate B Jones Substack" becomes "Nate B. Jones B
    // Jones Substack", and every pass mangles it further.
    const re = new RegExp(`\\b${escaped}\\b(?!\\s+B\\.?\\s+Jones)`, "gi");
    result = result.replace(re, full);
  }
  return result;
}

function canonicalizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const out = { ...metadata };
  out.author = canonicalizePersonName(out.author);
  if (Array.isArray(out.people)) {
    out.people = out.people.map((p) => canonicalizePersonName(p));
  }
  out.source_name = canonicalizeEmbeddedNames(out.source_name);
  out.title = canonicalizeEmbeddedNames(out.title);
  return out;
}

// Deterministic (non-AI) link extraction from raw captured text — markdown
// links [text](url) plus bare http(s) URLs that aren't already inside a
// markdown link. Used to power the GUI's "links found in this note" /
// "create a linked thought from this link" feature. Kept out of the AI
// extraction prompt since regex is more reliable and free for something
// this mechanical.
type ExtractedLink = { text: string; url: string };

function extractLinksFromContent(content: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const mdLinkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  const mdSpans: Array<[number, number]> = [];
  while ((m = mdLinkRe.exec(content)) !== null) {
    const url = m[2];
    mdSpans.push([m.index, m.index + m[0].length]);
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ text: m[1].trim(), url });
    }
  }
  const bareUrlRe = /(https?:\/\/[^\s)]+)/g;
  while ((m = bareUrlRe.exec(content)) !== null) {
    const insideMd = mdSpans.some(([start, end]) => m!.index >= start && m!.index < end);
    if (insideMd) continue;
    const url = m[1].replace(/[.,;:!?]+$/, "");
    if (!seen.has(url)) {
      seen.add(url);
      links.push({ text: url, url });
    }
  }
  return links;
}

// Some notes are written by the machine to keep track of itself — changelog
// entries and work orders, 39 of the archive's 176 when the shelf was added.
// They are real notes and they stay searchable, but they are not what anyone
// opens the archive to read, and at a fifth of everything they crowd out what
// is. `thoughts.shelved` is maintained by a trigger from the tags in
// shelved_topics (see the tidy_tags_and_shelf migration), so the rule lives in
// the database and no client re-implements it. Every tool that returns a LIST
// hides them unless asked; fetch by id never does, because asking for a note by
// its id is asking for that note.
const SHELF_HINT =
  "Machine bookkeeping (changelog entries, work orders) is hidden; pass include_shelved to see it.";

// Which of these ids are shelved. Used where the rows come back from an RPC
// that cannot filter on the column — the alternative, re-deriving the rule from
// metadata in TypeScript, is a second copy of it that would drift.
async function shelvedIds(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const { data } = await supabase
    .from("thoughts")
    .select("id")
    .in("id", ids)
    .eq("shelved", true);
  return new Set(((data || []) as { id: string }[]).map((r) => r.id));
}

// Vector search answers "what is this about"; it does not answer "which notes
// contain this word". A generic term like "building" is about nothing in
// particular, so it scores below any sensible threshold even when it appears in
// eleven titles. This fills that gap by matching the literal text as well.
async function keywordMatches(
  query: string,
  limit: number,
  includeShelved = false
): Promise<ThoughtMatch[]> {
  const cleaned = query.trim().replace(/[%_,()]/g, " ").trim();
  if (cleaned.length < 2) return [];

  // Every word must appear somewhere, in any order: "burn tokens" should find
  // "token burn". Postgres filters on the first word, then the rest are checked
  // against everything searchable — tags, author and source included.
  const words = cleaned.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const lead = words[0];

  const seen = new Map<string, ThoughtMatch>();
  // metadata is JSONB: ->> renders a field as text, so tag and people arrays
  // are searchable as their JSON text.
  const columns = ["metadata->>title", "content", "metadata->>topics",
                   "metadata->>people", "metadata->>author", "metadata->>source_name"];
  for (const column of columns) {
    let kq = supabase
      .from("thoughts")
      .select("id, content, metadata, created_at")
      .ilike(column, `%${lead}%`)
      .limit(50);
    if (!includeShelved) kq = kq.eq("shelved", false);
    const { data } = await kq;
    for (const row of (data || []) as ThoughtRecord[]) {
      if (seen.has(row.id)) continue;
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const hay = [
        row.content, meta.title, meta.author, meta.source_name,
        JSON.stringify(meta.topics || []), JSON.stringify(meta.people || []),
      ].join(" ").toLowerCase();
      // "tokens" should find "token burn", so tolerate the plural.
      const has = (w: string) =>
        hay.includes(w) || (w.length > 3 && w.endsWith("s") && hay.includes(w.slice(0, -1)));
      if (!words.every(has)) continue;
      const inTitle = String(meta.title || "").toLowerCase().includes(lead);
      seen.set(row.id, { ...row, similarity: inTitle ? 0.3 : 0.2 } as ThoughtMatch);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

async function extractMetadata(text: string): Promise<Record<string, unknown>> {
  const vocab = await loadVocabulary();

  // Wording unchanged from when the list was hardcoded — only its source moved.
  // With no list at all (a cold isolate that could not reach the table) the
  // reuse paragraph would be nonsense, so it is dropped rather than shown empty.
  const topicsGuidance = [
    vocab.preferred.length
      ? `These tags are already used here, so reuse one whenever it genuinely describes the note, copied exactly as spelled:\n${vocab.preferred.join(", ")}\nThe list is a convenience, not a constraint. It reflects what this archive usually collects, and notes on entirely different subjects are normal and expected. Tag the note for what it is actually about: if that needs a word not on the list, use that word. Never stretch a listed tag to cover something it does not really describe — a wrong tag from the list is the worst outcome of all, worse than any new tag.`
      : `Tag the note for what it is actually about.`,
    vocab.collection.length
      ? `Never use ${quotedList(vocab.collection)}: those are collection tags, applied later from the source.`
      : "",
  ].filter(Boolean).join(" ");

  const r = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Extract metadata from the user's captured thought. Return JSON with:
- "title": a short (under 12 words) descriptive title for this note — the headline of the article being referenced, or a title you'd give the user's own observation if there's no external source (null only if the content is too short/fragmentary to title, e.g. a one-word note).
- "people": array of people mentioned in the user's own commentary or discussion (empty if none). Do NOT include the author of an external article/post/video being referenced here — that goes in "author" instead.
- "author": the named author, writer, or speaker of an external piece (article, post, video, quote) that this thought references or summarizes (null if none, or if this is the user's own original observation with no external source). If that person is also discussed further in the thought itself, list them in both "author" and "people".
- "source_name": the name of the publication, newsletter, site, or channel the referenced piece came from, if any (null if none).
- "source_url": a URL explicitly given for the source, if any (null if none).
- "published_date": the ORIGINAL publish date of the external piece being referenced, as YYYY-MM-DD (null if none is stated or this isn't referencing external content). This is different from when the user captured the note — only fill this in if a publish/posted date is explicitly stated or strongly implied in the text.
- "action_items": array of implied to-dos (empty if none)
- "dates_mentioned": array of dates YYYY-MM-DD (empty if none)
- "topics": array of 1-3 short topic tags (always at least one). ${topicsGuidance}
- "type": one of "observation", "task", "idea", "reference", "person_note"
Only extract what's explicitly there.`,
        },
        { role: "user", content: text },
      ],
    }),
  });
  const d = await r.json();
  try {
    return canonicalizeMetadata(JSON.parse(d.choices[0].message.content));
  } catch {
    return { topics: ["uncategorized"], type: "observation" };
  }
}

// --- MCP Server Setup ---

import {
  TASK_COLUMNS,
  TASK_STATUSES,
  OPEN_STATUSES,
  RECUR_HELP,
  type TaskRecord,
  parseISODate,
  formatISODate,
  todayISO,
  parseRecur,
  nextRecurrence,
  formatTask,
} from "./tasks.ts";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "open-brain",
    version: "1.0.0",
  });

  // ChatGPT compatibility: restricted connector surfaces, company knowledge, and deep
  // research look for exact read-only `search` and `fetch` tool shapes.
  server.registerTool(
    "search",
    {
      title: "Search Open Brain",
      description:
        "Search Open Brain memories by meaning. Use this read-only compatibility tool when ChatGPT needs search/fetch-style access to stored thoughts.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        query: z.string().describe("The search query to run against Open Brain thoughts"),
      },
    },
    async ({ query }) => {
      try {
        const qEmb = await getEmbedding(query);
        const { data: vector, error } = await supabase.rpc("match_thoughts", {
          query_embedding: qEmb,
          // Over-fetch: the shelved ones are dropped below, and asking for
          // exactly ten would return six.
          match_threshold: 0.35,
          match_count: 20,
          filter: {},
        });

        const hidden = await shelvedIds(((vector || []) as ThoughtMatch[]).map((t) => t.id));
        const found = ((vector || []) as ThoughtMatch[]).filter((t) => !hidden.has(t.id));
        if (found.length < 10) {
          const have = new Set(found.map((t) => t.id));
          for (const hit of await keywordMatches(query, 10 - found.length)) {
            if (!have.has(hit.id)) found.push(hit);
          }
        }
        const data = found.slice(0, 10);

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Search error: ${error.message}` }],
            isError: true,
          };
        }

        const results = ((data || []) as ThoughtMatch[]).map((t) => ({
          id: t.id,
          title: thoughtTitle(t.content, t.created_at, t.metadata),
          url: thoughtUrl(t.id),
        }));

        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results }) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch Open Brain Thought",
      description:
        "Fetch one Open Brain thought by ID after using search. Use this read-only compatibility tool to retrieve the full text and metadata for citation.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        id: z.string().describe("The Open Brain thought ID returned by the search tool"),
        max_chars: z
          .number()
          .optional()
          .describe(
            "Return only the first N characters of the text, with full metadata. Use this to confirm which note an id refers to without pulling a whole article into context. Omit for the complete text."
          ),
      },
    },
    async ({ id, max_chars }) => {
      try {
        const { data, error } = await supabase
          .from("thoughts")
          .select("id, content, metadata, created_at, updated_at")
          .eq("id", id)
          .single();

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Fetch error: ${error.message}` }],
            isError: true,
          };
        }

        const thought = data as ThoughtRecord;
        const full = thought.content || "";
        const truncated = typeof max_chars === "number" && max_chars > 0 && full.length > max_chars;

        const document = {
          id: thought.id,
          title: thoughtTitle(thought.content, thought.created_at, thought.metadata),
          text: truncated ? full.slice(0, max_chars) : full,
          ...(truncated ? { truncated: true, total_chars: full.length } : {}),
          url: thoughtUrl(thought.id),
          metadata: {
            ...thought.metadata,
            created_at: thought.created_at,
            updated_at: thought.updated_at,
          },
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(document) }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 1: Semantic Search
  server.registerTool(
    "search_thoughts",
    {
      title: "Search Thoughts",
      description:
        "Search captured thoughts by meaning. Use this when the user asks about a topic, person, or idea they've previously captured.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        query: z.string().describe("What to search for"),
        limit: z.number().optional().default(10),
        threshold: z.number().optional().default(0.35),
        include_shelved: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include the machine's own bookkeeping — changelog entries and work orders. Left out by default: they are a fifth of the archive and are not what anyone searches it to find. Pass true when the question is about the system's own history."
          ),
        format: z
          .enum(["text", "full", "json"])
          .optional()
          .default("text")
          .describe("\"text\" (default) for a compact one-entry-per-match summary — title, type, topics, snippet and id. \"full\" for the complete text of every match (large; prefer fetch on a single id instead). \"json\" for a machine-parseable array of full thought objects (used by the Open Brain Catalog GUI)."),
      },
    },
    async ({ query, limit, threshold, format, include_shelved }) => {
      try {
        const qEmb = await getEmbedding(query);
        const { data: vector, error } = await supabase.rpc("match_thoughts", {
          query_embedding: qEmb,
          match_threshold: threshold,
          // The RPC cannot filter on the shelved column, so ask for headroom
          // and drop them here. Without it a search for a well-covered subject
          // returns a short list padded with changelog entries.
          match_count: include_shelved ? limit : limit * 2,
          filter: {},
        });

        // Computed even when nothing is being hidden: format "json" labels each
        // result, so the catalog can offer its own toggle without a second copy
        // of the rule.
        const hidden = await shelvedIds(((vector || []) as ThoughtMatch[]).map((t) => t.id));
        const found = include_shelved
          ? [...((vector || []) as ThoughtMatch[])]
          : ((vector || []) as ThoughtMatch[]).filter((t) => !hidden.has(t.id));

        // Top up with literal matches so a plain keyword still finds its notes.
        if (found.length < limit) {
          const have = new Set(found.map((t) => t.id));
          for (const hit of await keywordMatches(query, limit - found.length, include_shelved)) {
            if (!have.has(hit.id)) found.push(hit);
          }
        }
        const data = found.slice(0, limit);

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Search error: ${error.message}` }],
            isError: true,
          };
        }

        if (!data || data.length === 0) {
          if (format === "json") {
            return { content: [{ type: "text" as const, text: "[]" }] };
          }
          return {
            content: [{ type: "text" as const, text: `No thoughts found matching "${query}".` }],
          };
        }

        if (format === "json") {
          const items = (data as ThoughtMatch[]).map((t) => ({
            id: t.id,
            content: t.content,
            created_at: t.created_at,
            similarity: t.similarity,
            shelved: hidden.has(t.id),
            metadata: t.metadata || {},
          }));
          return { content: [{ type: "text" as const, text: JSON.stringify(items) }] };
        }

        if (format === "text") {
          const lines = (data as ThoughtMatch[]).map((t, i) => compactThought(t, i));
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Found ${data.length} thought(s):\n\n${lines.join("\n\n")}\n\n` +
                  `Use fetch(id) for the full text of one, or fetch(id, max_chars) for its opening.` +
                  (!include_shelved && hidden.size ? `\n${SHELF_HINT}` : ""),
              },
            ],
          };
        }

        const results = data.map(
          (
            t: ThoughtMatch,
            i: number
          ) => {
            const m = t.metadata || {};
            const parts = [
              `--- Result ${i + 1} (${(t.similarity * 100).toFixed(1)}% match) ---`,
              `Captured: ${new Date(t.created_at).toLocaleDateString()}`,
              `Type: ${m.type || "unknown"}`,
            ];
            if (Array.isArray(m.topics) && m.topics.length)
              parts.push(`Topics: ${(m.topics as string[]).join(", ")}`);
            if (Array.isArray(m.people) && m.people.length)
              parts.push(`People: ${(m.people as string[]).join(", ")}`);
            if (m.author) parts.push(`Author: ${m.author}`);
            if (m.source_name) parts.push(`Source: ${m.source_name}`);
            if (Array.isArray(m.action_items) && m.action_items.length)
              parts.push(`Actions: ${(m.action_items as string[]).join("; ")}`);
            parts.push(`\n${t.content}`);
            parts.push(`   [id: ${t.id}]`);
            return parts.join("\n");
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `Found ${data.length} thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 2: List Recent
  server.registerTool(
    "list_thoughts",
    {
      title: "List Recent Thoughts",
      description:
        "List recently captured thoughts with optional filters by type, topic, person, or time range.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        limit: z.number().optional().default(10),
        type: z.string().optional().describe("Filter by type: observation, task, idea, reference, person_note"),
        topic: z.string().optional().describe("Filter by topic tag"),
        person: z.string().optional().describe("Filter by person mentioned"),
        days: z.number().optional().describe("Only thoughts from the last N days"),
        include_shelved: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "Include the machine's own bookkeeping — changelog entries and work orders. Left out by default: they are a fifth of the archive and would fill a list of recent notes with the assistant talking about itself. Pass true to review what the system has been doing."
          ),
        format: z
          .enum(["text", "full", "json"])
          .optional()
          .default("text")
          .describe("\"text\" (default) for a compact one-entry-per-note summary — title, type, topics, snippet and id. \"full\" for the complete text of every note (large; prefer fetch on a single id instead). \"json\" for a machine-parseable array of full thought objects (used by the Open Brain Catalog GUI)."),
      },
    },
    async ({ limit, type, topic, person, days, format, include_shelved }) => {
      try {
        let q = supabase
          .from("thoughts")
          .select("id, content, metadata, created_at, shelved")
          .order("created_at", { ascending: false })
          .limit(limit);

        // In the query, not after it: filtering the page afterwards would let
        // shelved rows eat the limit and return three notes where ten were
        // asked for. thoughts_unshelved_recent_idx exists for exactly this.
        if (!include_shelved) q = q.eq("shelved", false);

        if (type) q = q.contains("metadata", { type });
        if (topic) q = q.contains("metadata", { topics: [topic] });
        if (person) q = q.contains("metadata", { people: [person] });
        if (days) {
          const since = new Date();
          since.setDate(since.getDate() - days);
          q = q.gte("created_at", since.toISOString());
        }

        const { data, error } = await q;

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        if (!data || !data.length) {
          if (format === "json") {
            return { content: [{ type: "text" as const, text: "[]" }] };
          }
          return { content: [{ type: "text" as const, text: "No thoughts found." }] };
        }

        if (format === "json") {
          const items = data.map(
            (t: {
              id: string;
              content: string;
              metadata: Record<string, unknown>;
              created_at: string;
              shelved?: boolean;
            }) => ({
              id: t.id,
              content: t.content,
              created_at: t.created_at,
              shelved: !!t.shelved,
              metadata: t.metadata || {},
            })
          );
          return { content: [{ type: "text" as const, text: JSON.stringify(items) }] };
        }

        if (format === "text") {
          const lines = (
            data as {
              id: string;
              content: string;
              metadata: Record<string, unknown>;
              created_at: string;
            }[]
          ).map((t, i) => compactThought(t, i));
          return {
            content: [
              {
                type: "text" as const,
                text:
                  `${data.length} recent thought(s):\n\n${lines.join("\n\n")}\n\n` +
                  `Use fetch(id) for the full text of one, or fetch(id, max_chars) for its opening.` +
                  (include_shelved ? "" : `\n${SHELF_HINT}`),
              },
            ],
          };
        }

        const results = data.map(
          (
            t: { id: string; content: string; metadata: Record<string, unknown>; created_at: string },
            i: number
          ) => {
            const m = t.metadata || {};
            const tags = Array.isArray(m.topics) ? (m.topics as string[]).join(", ") : "";
            const bylineLines: string[] = [];
            if (m.author) bylineLines.push(`   Author: ${m.author}`);
            if (m.source_name) bylineLines.push(`   Source: ${m.source_name}`);
            const byline = bylineLines.length ? bylineLines.join("\n") + "\n" : "";
            return `${i + 1}. [${new Date(t.created_at).toLocaleDateString()}] (${m.type || "??"}${tags ? " - " + tags : ""})\n${byline}   ${t.content}\n   [id: ${t.id}]`;
          }
        );

        return {
          content: [
            {
              type: "text" as const,
              text: `${data.length} recent thought(s):\n\n${results.join("\n\n")}`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 3: Stats
  server.registerTool(
    "thought_stats",
    {
      title: "Thought Statistics",
      description: "Get a summary of all captured thoughts: totals, types, top topics, and people.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {},
    },
    async () => {
      try {
        const { count } = await supabase
          .from("thoughts")
          .select("*", { count: "exact", head: true });

        const { data } = await supabase
          .from("thoughts")
          .select("metadata, created_at, shelved")
          .order("created_at", { ascending: false });

        let shelved = 0;
        const types: Record<string, number> = {};
        const topics: Record<string, number> = {};
        const people: Record<string, number> = {};

        for (const r of data || []) {
          const m = (r.metadata || {}) as Record<string, unknown>;
          if ((r as { shelved?: boolean }).shelved) shelved++;
          if (m.type) types[m.type as string] = (types[m.type as string] || 0) + 1;
          if (Array.isArray(m.topics))
            for (const t of m.topics) topics[t as string] = (topics[t as string] || 0) + 1;
          if (Array.isArray(m.people))
            for (const p of m.people) people[p as string] = (people[p as string] || 0) + 1;
        }

        const sort = (o: Record<string, number>): [string, number][] =>
          Object.entries(o)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        const lines: string[] = [
          `Total thoughts: ${count}` +
            (shelved
              ? ` (${(count ?? 0) - shelved} in the reading list, ${shelved} machine bookkeeping)`
              : ""),
          `Date range: ${
            data?.length
              ? new Date(data[data.length - 1].created_at).toLocaleDateString() +
                " → " +
                new Date(data[0].created_at).toLocaleDateString()
              : "N/A"
          }`,
          "",
          "Types:",
          ...sort(types).map(([k, v]) => `  ${k}: ${v}`),
        ];

        if (Object.keys(topics).length) {
          lines.push("", "Top topics:");
          for (const [k, v] of sort(topics)) lines.push(`  ${k}: ${v}`);
        }

        if (Object.keys(people).length) {
          lines.push("", "People mentioned:");
          for (const [k, v] of sort(people)) lines.push(`  ${k}: ${v}`);
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 4: Capture Thought
  server.registerTool(
    "capture_thought",
    {
      title: "Capture Thought",
      description:
        "Save a new thought to the Open Brain. Generates an embedding and extracts metadata automatically. Use this when the user wants to save something to their brain directly from any AI client — notes, insights, decisions, or migrated content from other systems.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      inputSchema: {
        content: z.string().describe("The thought to capture — a clear, standalone statement that will make sense when retrieved later by any AI"),
        author: z.string().optional().describe("Who wrote it. Overrides the extractor — used when the writer is known for certain, e.g. a note typed into the catalog by its owner."),
        published_date: z.string().optional().describe("YYYY-MM-DD. Overrides the extractor. For a note written here rather than captured from elsewhere, this is the day it was filed."),
        source_name: z.string().optional().describe("Where it came from. Overrides the extractor."),
        parent_thought_id: z
          .string()
          .optional()
          .describe("If set, bidirectionally links the new thought to this existing thought's id (both thoughts get each other's id added to metadata.linked_thought_ids). Used when spinning a note off from a link found inside another note."),
      },
    },
    async ({ content, author, published_date, source_name, parent_thought_id }) => {
      try {
        const [embedding, metadata] = await Promise.all([
          getEmbedding(content),
          extractMetadata(content),
        ]);

        const extractedLinks = extractLinksFromContent(content);
        const linkedIds = parent_thought_id ? [parent_thought_id] : [];

        // Known facts beat guesses: the extractor infers an author and a date
        // from the text, which is right for captured reading and wrong for a
        // note whose writer and filing date the caller already knows.
        if (author !== undefined) metadata.author = author;
        if (published_date !== undefined) metadata.published_date = published_date;
        if (source_name !== undefined) metadata.source_name = source_name;

        // upsert_thought stores p_payload directly into the `metadata` column
        // (no unwrapping) — pass the metadata fields flat, not nested under a
        // "metadata" key, or every lookup of metadata.type/topics/etc. downstream
        // ends up looking one level too deep and finds nothing.
        const { data: upsertResult, error: upsertError } = await supabase.rpc("upsert_thought", {
          p_content: content,
          p_payload: {
            ...metadata,
            source: "mcp",
            extracted_links: extractedLinks,
            linked_thought_ids: linkedIds,
          },
        });

        if (upsertError) {
          return {
            content: [{ type: "text" as const, text: `Failed to capture: ${upsertError.message}` }],
            isError: true,
          };
        }

        const thoughtId = upsertResult?.id;
        const { error: embError } = await supabase
          .from("thoughts")
          .update({ embedding })
          .eq("id", thoughtId);

        if (embError) {
          return {
            content: [{ type: "text" as const, text: `Failed to save embedding: ${embError.message}` }],
            isError: true,
          };
        }

        let linkWarning = "";
        if (parent_thought_id && thoughtId) {
          const { data: parent, error: parentFetchErr } = await supabase
            .from("thoughts")
            .select("id, metadata")
            .eq("id", parent_thought_id)
            .maybeSingle();
          if (parentFetchErr || !parent) {
            linkWarning = ` (warning: could not link back to parent thought — ${parentFetchErr?.message || "not found"})`;
          } else {
            const parentMeta = (parent.metadata || {}) as Record<string, unknown>;
            const existing = Array.isArray(parentMeta.linked_thought_ids)
              ? (parentMeta.linked_thought_ids as string[])
              : [];
            if (!existing.includes(thoughtId)) {
              const { error: parentUpdErr } = await supabase
                .from("thoughts")
                .update({ metadata: { ...parentMeta, linked_thought_ids: [...existing, thoughtId] } })
                .eq("id", parent_thought_id);
              if (parentUpdErr) linkWarning = ` (warning: could not link back to parent thought — ${parentUpdErr.message})`;
            }
          }
        }

        const meta = metadata as Record<string, unknown>;
        let confirmation = `Captured as ${meta.type || "thought"}`;
        if (meta.title) confirmation += `: "${meta.title}"`;
        if (Array.isArray(meta.topics) && meta.topics.length)
          confirmation += ` — ${(meta.topics as string[]).join(", ")}`;
        if (Array.isArray(meta.people) && meta.people.length)
          confirmation += ` | People: ${(meta.people as string[]).join(", ")}`;
        if (meta.author) confirmation += ` | Author: ${meta.author}`;
        if (meta.source_name) confirmation += ` | Source: ${meta.source_name}`;
        if (meta.published_date) confirmation += ` | Published: ${meta.published_date}`;
        if (Array.isArray(meta.action_items) && meta.action_items.length)
          confirmation += ` | Actions: ${(meta.action_items as string[]).join("; ")}`;
        if (extractedLinks.length) confirmation += ` | Found ${extractedLinks.length} link(s) in the text`;
        if (parent_thought_id) confirmation += ` | Linked to ${parent_thought_id}${linkWarning}`;
        confirmation += ` | id: ${thoughtId}`;

        return {
          content: [{ type: "text" as const, text: confirmation }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 5: Delete Thought
  server.registerTool(
    "delete_thought",
    {
      title: "Delete Thought",
      description:
        "Permanently delete a captured thought by ID. IDs are shown in the output of list_thoughts and search_thoughts as \"[id: ...]\". Use this to remove test entries, duplicates, or mistakes. This cannot be undone.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        id: z.string().describe("The ID of the thought to delete, as returned by list_thoughts, search_thoughts, search, or fetch"),
      },
    },
    async ({ id }) => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from("thoughts")
          .select("id, content")
          .eq("id", id)
          .maybeSingle();

        if (fetchError) {
          return {
            content: [{ type: "text" as const, text: `Error checking thought: ${fetchError.message}` }],
            isError: true,
          };
        }

        if (!existing) {
          return {
            content: [{ type: "text" as const, text: `No thought found with id "${id}". It may already be deleted.` }],
            isError: true,
          };
        }

        const { error: deleteError } = await supabase
          .from("thoughts")
          .delete()
          .eq("id", id);

        if (deleteError) {
          return {
            content: [{ type: "text" as const, text: `Failed to delete: ${deleteError.message}` }],
            isError: true,
          };
        }

        const preview = existing.content.replace(/\s+/g, " ").trim().slice(0, 80);
        const suffix = existing.content.length > 80 ? "…" : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `Deleted thought ${id}: "${preview}${suffix}"`,
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 6: Backfill Author/Source
  server.registerTool(
    "backfill_author_source",
    {
      title: "Backfill Author/Source Metadata",
      description:
        "Maintenance tool: re-extracts \"author\" and \"source_name\"/\"source_url\" metadata for existing thoughts captured before those fields existed, without touching their existing type/topics/people/action_items. Safe to re-run — it only processes thoughts that don't already have author/source_name set (even to null), so it's a one-time catch-up rather than something that needs regular use.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {},
    },
    async () => {
      try {
        const { data, error } = await supabase.from("thoughts").select("id, content, metadata");
        if (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        const candidates = (data || []).filter((t) => {
          const m = (t.metadata || {}) as Record<string, unknown>;
          return m.author === undefined && m.source_name === undefined;
        });

        if (!candidates.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Nothing to backfill — every thought already has author/source metadata (even if null).",
              },
            ],
          };
        }

        let updated = 0;
        let foundSomething = 0;
        const errors: string[] = [];

        // Small concurrent batches so a large backlog doesn't risk hitting the
        // edge function's request timeout with a long sequential chain of
        // OpenRouter calls.
        const BATCH = 5;
        for (let i = 0; i < candidates.length; i += BATCH) {
          const batch = candidates.slice(i, i + BATCH);
          await Promise.all(
            batch.map(async (t) => {
              try {
                const extracted = (await extractMetadata(t.content)) as Record<string, unknown>;
                const author = extracted.author ?? null;
                const source_name = extracted.source_name ?? null;
                const source_url = extracted.source_url ?? null;
                const newMetadata = { ...(t.metadata || {}), author, source_name, source_url };
                const { error: updErr } = await supabase
                  .from("thoughts")
                  .update({ metadata: newMetadata })
                  .eq("id", t.id);
                if (updErr) {
                  errors.push(`${t.id}: ${updErr.message}`);
                } else {
                  updated++;
                  if (author || source_name) foundSomething++;
                }
              } catch (err: unknown) {
                errors.push(`${t.id}: ${(err as Error).message}`);
              }
            })
          );
        }

        let summary = `Backfilled ${updated}/${candidates.length} thought(s); ${foundSomething} had an author or source to extract.`;
        if (errors.length) summary += `\n${errors.length} error(s):\n` + errors.join("\n");
        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // The vocabulary, for anything that needs to read it without reaching the
  // database directly. Nothing does today — tidy-archive.py, which used to,
  // was retired once the nightly job took over folding — but a list this
  // central should be readable by a script that has the access key and no
  // database credentials, rather than only by copying it out again.
  server.registerTool(
    "topic_vocabulary",
    {
      title: "Topic Vocabulary",
      description:
        "The controlled vocabulary: the topic tags the capture extractor is told to reuse, and the collection tags it is told never to guess. This table is the single source of truth — the capture prompt reads it at runtime, so a change here takes effect on the next capture with no redeploy. Read-only; add or retire a term with one INSERT or DELETE on public.topic_vocabulary.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        format: z
          .enum(["text", "json"])
          .optional()
          .default("text")
          .describe("\"text\" (default) for a readable summary. \"json\" for {preferred: [...], collection: [...]} — use this when a script is going to write the list to a file."),
      },
    },
    async ({ format }) => {
      try {
        const vocab = await loadVocabulary();
        if (format === "json") {
          return { content: [{ type: "text" as const, text: JSON.stringify(vocab) }] };
        }
        const lines = [
          `Preferred topics (${vocab.preferred.length}), in the order the extractor is shown them:`,
          ...vocab.preferred.map((t) => `  ${t}`),
        ];
        if (vocab.collection.length) {
          lines.push(
            "",
            `Collection tags (${vocab.collection.length}) — applied later from the source, never guessed at capture:`,
            ...vocab.collection.map((t) => `  ${t}`)
          );
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 7: Normalize known name aliases
  server.registerTool(
    "normalize_names",
    {
      title: "Normalize Person Names",
      description:
        "Maintenance tool: applies the server's known name aliases (see NAME_ALIASES in source, e.g. \"Nate\" -> \"Nate B. Jones\") to every thought's author, people, and source_name metadata. Idempotent — only updates rows whose metadata actually changes, so it's safe to re-run after adding a new alias.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {},
    },
    async () => {
      try {
        const { data, error } = await supabase.from("thoughts").select("id, metadata");
        if (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        let changed = 0;
        const errors: string[] = [];
        for (const t of data || []) {
          const original = (t.metadata || {}) as Record<string, unknown>;
          const canon = canonicalizeMetadata(original);
          if (JSON.stringify(canon) === JSON.stringify(original)) continue;
          const { error: updErr } = await supabase
            .from("thoughts")
            .update({ metadata: canon })
            .eq("id", t.id);
          if (updErr) errors.push(`${t.id}: ${updErr.message}`);
          else changed++;
        }

        let summary = `Normalized names on ${changed} thought(s).`;
        if (errors.length) summary += `\n${errors.length} error(s):\n` + errors.join("\n");
        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 8: Update Thought
  server.registerTool(
    "update_thought",
    {
      title: "Update Thought",
      description:
        "Edit an existing thought's content and/or metadata fields (type, title, author, published_date, updated_date, source_name, source_url, topics, people). Only the fields you provide are changed — everything else is left as-is. If content is provided, its extracted_links are recomputed (deterministically, via regex — this does NOT re-run AI extraction, so it won't silently rewrite your topics/type/author).",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        id: z.string().describe("The id of the thought to update"),
        content: z.string().optional().describe("New content for the thought"),
        type: z.enum(["observation", "task", "idea", "reference", "person_note"])
          .nullable().optional()
          .describe("New type (pass null to clear). The AI extractor's guess is often wrong for notes it has not seen the shape of before, so this allows a correction."),
        title: z.string().nullable().optional().describe("New title (pass null to clear)"),
        author: z.string().nullable().optional().describe("New author (pass null to clear)"),
        published_date: z.string().nullable().optional().describe("New published date, YYYY-MM-DD (pass null to clear)"),
        updated_date: z.string().nullable().optional().describe("When this note was last changed, YYYY-MM-DD (pass null to clear). The catalog stamps this itself when an edit changes something; housekeeping scripts leave it alone so tidying tags does not read as revising the note."),
        source_name: z.string().nullable().optional().describe("New source name (pass null to clear)"),
        source_url: z.string().nullable().optional().describe("New source URL (pass null to clear)"),
        topics: z.array(z.string()).optional().describe("Replacement topics array"),
        people: z.array(z.string()).optional().describe("Replacement people array"),
      },
    },
    async ({ id, content, type, title, author, published_date, updated_date, source_name, source_url, topics, people }) => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from("thoughts")
          .select("id, content, metadata")
          .eq("id", id)
          .maybeSingle();

        if (fetchError || !existing) {
          return {
            content: [{ type: "text" as const, text: `Could not find thought "${id}" — ${fetchError?.message || "no such thought"}.` }],
            isError: true,
          };
        }

        const meta = { ...((existing.metadata || {}) as Record<string, unknown>) };
        if (type !== undefined) meta.type = type;
        if (title !== undefined) meta.title = title;
        if (author !== undefined) meta.author = author;
        if (published_date !== undefined) meta.published_date = published_date;
        if (updated_date !== undefined) meta.updated_date = updated_date;
        if (source_name !== undefined) meta.source_name = source_name;
        if (source_url !== undefined) meta.source_url = source_url;
        if (topics !== undefined) meta.topics = topics;
        if (people !== undefined) meta.people = people;

        const update: Record<string, unknown> = { metadata: canonicalizeMetadata(meta) };
        const newContent = content !== undefined ? content : existing.content;
        if (content !== undefined) {
          update.content = content;
          meta.extracted_links = extractLinksFromContent(content);
          update.metadata = canonicalizeMetadata(meta);
          update.embedding = await getEmbedding(content);
        }

        const { error: updErr } = await supabase.from("thoughts").update(update).eq("id", id);
        if (updErr) {
          return {
            content: [{ type: "text" as const, text: `Failed to update: ${updErr.message}` }],
            isError: true,
          };
        }

        const preview = newContent.replace(/\s+/g, " ").trim().slice(0, 80);
        return {
          content: [{ type: "text" as const, text: `Updated thought ${id}: "${preview}${newContent.length > 80 ? "…" : ""}"` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 9: Link Thoughts
  server.registerTool(
    "link_thoughts",
    {
      title: "Link Thoughts",
      description:
        "Bidirectionally link two thoughts by id — each gets the other's id added to metadata.linked_thought_ids. Safe to call repeatedly (deduped).",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        id_a: z.string().describe("First thought id"),
        id_b: z.string().describe("Second thought id"),
      },
    },
    async ({ id_a, id_b }) => {
      try {
        if (id_a === id_b) {
          return {
            content: [{ type: "text" as const, text: "Cannot link a thought to itself." }],
            isError: true,
          };
        }

        const { data: rows, error } = await supabase
          .from("thoughts")
          .select("id, metadata")
          .in("id", [id_a, id_b]);

        if (error || !rows || rows.length !== 2) {
          return {
            content: [{ type: "text" as const, text: `Could not find both thoughts — ${error?.message || "one or both ids don't exist"}.` }],
            isError: true,
          };
        }

        for (const row of rows) {
          const otherId = row.id === id_a ? id_b : id_a;
          const meta = (row.metadata || {}) as Record<string, unknown>;
          const existing = Array.isArray(meta.linked_thought_ids) ? (meta.linked_thought_ids as string[]) : [];
          if (existing.includes(otherId)) continue;
          const { error: updErr } = await supabase
            .from("thoughts")
            .update({ metadata: { ...meta, linked_thought_ids: [...existing, otherId] } })
            .eq("id", row.id);
          if (updErr) {
            return {
              content: [{ type: "text" as const, text: `Failed to link: ${updErr.message}` }],
              isError: true,
            };
          }
        }

        return { content: [{ type: "text" as const, text: `Linked ${id_a} ↔ ${id_b}.` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 10: Unlink Thoughts
  server.registerTool(
    "unlink_thoughts",
    {
      title: "Unlink Thoughts",
      description: "Remove a bidirectional link between two thoughts created by link_thoughts (or by the parent_thought_id option on capture_thought).",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        id_a: z.string().describe("First thought id"),
        id_b: z.string().describe("Second thought id"),
      },
    },
    async ({ id_a, id_b }) => {
      try {
        const { data: rows, error } = await supabase
          .from("thoughts")
          .select("id, metadata")
          .in("id", [id_a, id_b]);

        if (error || !rows) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error?.message || "lookup failed"}` }],
            isError: true,
          };
        }

        for (const row of rows) {
          const otherId = row.id === id_a ? id_b : id_a;
          const meta = (row.metadata || {}) as Record<string, unknown>;
          const existing = Array.isArray(meta.linked_thought_ids) ? (meta.linked_thought_ids as string[]) : [];
          if (!existing.includes(otherId)) continue;
          const { error: updErr } = await supabase
            .from("thoughts")
            .update({ metadata: { ...meta, linked_thought_ids: existing.filter((x) => x !== otherId) } })
            .eq("id", row.id);
          if (updErr) {
            return {
              content: [{ type: "text" as const, text: `Failed to unlink: ${updErr.message}` }],
              isError: true,
            };
          }
        }

        return { content: [{ type: "text" as const, text: `Unlinked ${id_a} ↔ ${id_b}.` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 11: Backfill Title/Published Date
  server.registerTool(
    "backfill_title_published",
    {
      title: "Backfill Title/Published Date Metadata",
      description:
        "Maintenance tool: re-extracts \"title\" and \"published_date\" metadata for existing thoughts captured before those fields existed, without touching other fields. Also fills in extracted_links (regex-derived) and linked_thought_ids (empty array) if missing. Safe to re-run — only processes thoughts missing title (even if null).",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {},
    },
    async () => {
      try {
        const { data, error } = await supabase.from("thoughts").select("id, content, metadata");
        if (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        const candidates = (data || []).filter((t) => {
          const m = (t.metadata || {}) as Record<string, unknown>;
          return m.title === undefined;
        });

        let updated = 0;
        let foundSomething = 0;
        const errors: string[] = [];

        const BATCH = 5;
        for (let i = 0; i < candidates.length; i += BATCH) {
          const batch = candidates.slice(i, i + BATCH);
          await Promise.all(
            batch.map(async (t) => {
              try {
                const extracted = (await extractMetadata(t.content)) as Record<string, unknown>;
                const title = extracted.title ?? null;
                const published_date = extracted.published_date ?? null;
                const existingMeta = (t.metadata || {}) as Record<string, unknown>;
                const newMetadata: Record<string, unknown> = {
                  ...existingMeta,
                  title,
                  published_date,
                };
                if (newMetadata.extracted_links === undefined) newMetadata.extracted_links = extractLinksFromContent(t.content);
                if (newMetadata.linked_thought_ids === undefined) newMetadata.linked_thought_ids = [];
                const { error: updErr } = await supabase
                  .from("thoughts")
                  .update({ metadata: newMetadata })
                  .eq("id", t.id);
                if (updErr) {
                  errors.push(`${t.id}: ${updErr.message}`);
                } else {
                  updated++;
                  if (title || published_date) foundSomething++;
                }
              } catch (err: unknown) {
                errors.push(`${t.id}: ${(err as Error).message}`);
              }
            })
          );
        }

        if (!candidates.length) {
          return {
            content: [{ type: "text" as const, text: "Nothing to backfill — every thought already has title metadata (even if null)." }],
          };
        }

        let summary = `Backfilled ${updated}/${candidates.length} thought(s); ${foundSomething} had a title or published date to extract.`;
        if (errors.length) summary += `\n${errors.length} error(s):\n` + errors.join("\n");
        return { content: [{ type: "text" as const, text: summary }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 14: Create Task
  server.registerTool(
    "create_task",
    {
      title: "Create Task",
      description:
        "Add a task to Open Brain. Deliberately cheap — no embedding, no AI metadata extraction, just one insert — so that capturing something you have to do is instant. Use this whenever the user says they need to do something, rather than capture_thought, which is for things they want to remember.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
      inputSchema: {
        title: z.string().describe("The task in one line, as the user would say it out loud"),
        notes: z.string().optional().describe("Anything else worth keeping: context, a phone number, what 'done' looks like"),
        status: z
          .enum(TASK_STATUSES)
          .optional()
          .describe("inbox (captured, not yet thought about — the default), next (actionable now), waiting (blocked on someone else), done, dropped (decided against, kept as a record)"),
        project: z.string().optional().describe("A grouping label, e.g. 'house' or 'open brain'"),
        due_date: z.string().optional().describe("YYYY-MM-DD. The day it is actually due — not the day you hope to do it."),
        defer_until: z
          .string()
          .optional()
          .describe("YYYY-MM-DD. Hides the task from the default list until this date. Use it for anything that cannot be started yet, so the list stays a list of things that are actually doable."),
        recur: z
          .string()
          .optional()
          .describe(`How often it repeats: ${RECUR_HELP}. The next instance is created when this one is completed.`),
        recur_from: z
          .enum(["due", "completion"])
          .optional()
          .describe("Whether the next instance counts from the due date ('due' — bins go out every Tuesday whether or not you did it) or from when you actually finished ('completion' — water the plants 5 days after you last watered them). Defaults to completion."),
        parent_id: z.string().optional().describe("The id of a task this one is a subtask of"),
        thought_id: z.string().optional().describe("The id of the thought this task came out of, linking the task back to the note that prompted it"),
        source: z.string().optional().describe("Where it was captured, e.g. 'claude' or 'catalog'. Defaults to 'mcp'."),
      },
    },
    async (args) => {
      try {
        const title = (args.title || "").trim();
        if (!title) {
          return {
            content: [{ type: "text" as const, text: "A task needs a title." }],
            isError: true,
          };
        }

        // Dates and repeat rules are checked before the insert so a bad one
        // comes back as an explanation rather than a Postgres constraint error.
        for (const field of ["due_date", "defer_until"] as const) {
          const value = args[field];
          if (value !== undefined && !parseISODate(value)) {
            return {
              content: [{ type: "text" as const, text: `${field} must be a real date as YYYY-MM-DD — got "${value}".` }],
              isError: true,
            };
          }
        }
        if (args.recur !== undefined && !parseRecur(args.recur)) {
          return {
            content: [{ type: "text" as const, text: `Could not read the repeat rule "${args.recur}". Try one of: ${RECUR_HELP}.` }],
            isError: true,
          };
        }

        const row = {
          title,
          notes: args.notes ?? null,
          status: args.status ?? "inbox",
          project: args.project ?? null,
          due_date: args.due_date ?? null,
          defer_until: args.defer_until ?? null,
          recur: args.recur ?? null,
          recur_from: args.recur_from ?? "completion",
          parent_id: args.parent_id ?? null,
          thought_id: args.thought_id ?? null,
          source: args.source ?? "mcp",
        };

        const { data, error } = await supabase
          .from("tasks")
          .insert(row)
          .select(TASK_COLUMNS)
          .single();

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Could not create the task: ${error.message}` }],
            isError: true,
          };
        }

        const t = data as TaskRecord;
        const when = t.due_date ? `, due ${t.due_date}` : "";
        return {
          content: [{ type: "text" as const, text: `Created task "${t.title}" [${t.status}]${when}. [id: ${t.id}]` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 15: List Tasks
  server.registerTool(
    "list_tasks",
    {
      title: "List Tasks",
      description:
        "List tasks, open ones by default. Deferred tasks and finished ones are left out unless asked for, so the default answer is a list of things that can actually be done now.",
      annotations: {
        readOnlyHint: true,
      },
      inputSchema: {
        status: z
          .array(z.enum(TASK_STATUSES))
          .optional()
          .describe("Which statuses to include. Defaults to the open ones: inbox, next, waiting."),
        project: z.string().optional().describe("Only tasks in this project"),
        due_before: z.string().optional().describe("YYYY-MM-DD — only tasks due on or before this date. Pass today's date for 'what is due now'."),
        include_deferred: z
          .boolean()
          .optional()
          .describe("Include tasks deferred to a future date. Off by default — the whole point of deferring is not to see them."),
        search: z.string().optional().describe("Case-insensitive substring match on the title"),
        limit: z.number().optional().describe("Maximum tasks to return (default 50)"),
        format: z
          .enum(["text", "json"])
          .optional()
          .describe("\"text\" (default) for one readable line per task. \"json\" for an array of full task objects, used by the Open Brain Catalog GUI."),
      },
    },
    async ({ status, project, due_before, include_deferred, search, limit, format }) => {
      try {
        const today = todayISO();
        const wanted = status && status.length ? status : OPEN_STATUSES;

        let q = supabase
          .from("tasks")
          .select(TASK_COLUMNS)
          .in("status", wanted)
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(limit ?? 50);

        if (project) q = q.eq("project", project);
        if (due_before) {
          if (!parseISODate(due_before)) {
            return {
              content: [{ type: "text" as const, text: `due_before must be a real date as YYYY-MM-DD — got "${due_before}".` }],
              isError: true,
            };
          }
          q = q.lte("due_date", due_before);
        }
        // A task with no defer date has nothing to hide behind, so it always
        // counts as available.
        if (!include_deferred) q = q.or(`defer_until.is.null,defer_until.lte.${today}`);
        if (search) q = q.ilike("title", `%${search}%`);

        const { data, error } = await q;

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        const tasks = (data || []) as TaskRecord[];

        if (format === "json") {
          return { content: [{ type: "text" as const, text: JSON.stringify(tasks) }] };
        }

        if (!tasks.length) {
          return { content: [{ type: "text" as const, text: "No tasks match." }] };
        }

        const lines = tasks.map((t, i) => formatTask(t, i, today));
        return {
          content: [{ type: "text" as const, text: `${tasks.length} task(s):\n\n${lines.join("\n\n")}` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 16: Update Task
  server.registerTool(
    "update_task",
    {
      title: "Update Task",
      description:
        "Change a task. Only the fields you pass are touched; pass null to clear an optional one. Use this to reschedule, defer, file into a project, or move a task to waiting or dropped. To finish a task use complete_task instead, which also handles repeats.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        id: z.string().describe("The id of the task to update"),
        title: z.string().optional().describe("New title"),
        notes: z.string().nullable().optional().describe("New notes (null to clear)"),
        status: z.enum(TASK_STATUSES).optional().describe("New status"),
        project: z.string().nullable().optional().describe("New project (null to clear)"),
        due_date: z.string().nullable().optional().describe("New due date, YYYY-MM-DD (null to clear)"),
        defer_until: z.string().nullable().optional().describe("New defer date, YYYY-MM-DD (null to clear)"),
        recur: z.string().nullable().optional().describe(`New repeat rule (null to stop repeating): ${RECUR_HELP}`),
        recur_from: z.enum(["due", "completion"]).optional().describe("Whether repeats count from the due date or from completion"),
        parent_id: z.string().nullable().optional().describe("New parent task id (null to detach)"),
        thought_id: z.string().nullable().optional().describe("New linked thought id (null to unlink)"),
      },
    },
    async (args) => {
      try {
        const { id, ...fields } = args;

        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (value !== undefined) update[key] = value;
        }

        if (typeof update.title === "string") {
          update.title = update.title.trim();
          if (!update.title) {
            return {
              content: [{ type: "text" as const, text: "A task needs a title." }],
              isError: true,
            };
          }
        }

        for (const field of ["due_date", "defer_until"] as const) {
          const value = update[field];
          if (typeof value === "string" && !parseISODate(value)) {
            return {
              content: [{ type: "text" as const, text: `${field} must be a real date as YYYY-MM-DD — got "${value}".` }],
              isError: true,
            };
          }
        }
        if (typeof update.recur === "string" && !parseRecur(update.recur)) {
          return {
            content: [{ type: "text" as const, text: `Could not read the repeat rule "${update.recur}". Try one of: ${RECUR_HELP}.` }],
            isError: true,
          };
        }

        if (!Object.keys(update).length) {
          return {
            content: [{ type: "text" as const, text: "Nothing to update — pass at least one field to change." }],
            isError: true,
          };
        }

        const { data, error } = await supabase
          .from("tasks")
          .update(update)
          .eq("id", id)
          .select(TASK_COLUMNS)
          .maybeSingle();

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Could not update the task: ${error.message}` }],
            isError: true,
          };
        }
        if (!data) {
          return {
            content: [{ type: "text" as const, text: `No task with id "${id}".` }],
            isError: true,
          };
        }

        const t = data as TaskRecord;
        const changed = Object.keys(update).join(", ");
        return {
          content: [{ type: "text" as const, text: `Updated ${changed} on "${t.title}" [${t.status}]. [id: ${t.id}]` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 17: Complete Task
  server.registerTool(
    "complete_task",
    {
      title: "Complete Task",
      description:
        "Mark a task done. If it repeats, the next instance is created automatically with its due date worked out from the repeat rule. Completing an already-completed task does nothing, so it is safe to call twice.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
      inputSchema: {
        id: z.string().describe("The id of the task to complete"),
      },
    },
    async ({ id }) => {
      try {
        const { data: existing, error: fetchError } = await supabase
          .from("tasks")
          .select(TASK_COLUMNS)
          .eq("id", id)
          .maybeSingle();

        if (fetchError || !existing) {
          return {
            content: [{ type: "text" as const, text: `No task with id "${id}"${fetchError ? ` — ${fetchError.message}` : ""}.` }],
            isError: true,
          };
        }

        const task = existing as TaskRecord;

        // Calling twice must not spawn a second copy of a repeating task.
        if (task.status === "done") {
          return {
            content: [{ type: "text" as const, text: `"${task.title}" was already completed${task.completed_at ? ` on ${task.completed_at.slice(0, 10)}` : ""}.` }],
          };
        }

        const { error: updErr } = await supabase
          .from("tasks")
          .update({ status: "done" })
          .eq("id", id);

        if (updErr) {
          return {
            content: [{ type: "text" as const, text: `Could not complete the task: ${updErr.message}` }],
            isError: true,
          };
        }

        const spec = task.recur ? parseRecur(task.recur) : null;
        if (!spec) {
          return { content: [{ type: "text" as const, text: `Completed "${task.title}".` }] };
        }

        const todayStr = todayISO();
        const today = parseISODate(todayStr)!;
        // From the due date, the schedule is the thing that matters and the
        // next instance follows the old one. From completion, it follows what
        // actually happened — which is today.
        const base =
          task.recur_from === "due" && task.due_date
            ? parseISODate(task.due_date) ?? today
            : today;
        const nextDue = formatISODate(nextRecurrence(spec, base, today));

        // A task deferred until a week before it was due should stay deferred
        // until a week before it is next due, so the gap travels with it.
        let nextDefer: string | null = null;
        if (task.defer_until && task.due_date) {
          const oldDefer = parseISODate(task.defer_until);
          const oldDue = parseISODate(task.due_date);
          const newDue = parseISODate(nextDue);
          if (oldDefer && oldDue && newDue) {
            const gap = oldDue.getTime() - oldDefer.getTime();
            nextDefer = formatISODate(new Date(newDue.getTime() - gap));
          }
        }

        const { data: spawned, error: insErr } = await supabase
          .from("tasks")
          .insert({
            title: task.title,
            notes: task.notes,
            // The repeat carries on in whatever state it was being worked in,
            // but a finished or abandoned one comes back as actionable.
            status: OPEN_STATUSES.includes(task.status) ? task.status : "next",
            project: task.project,
            due_date: nextDue,
            defer_until: nextDefer,
            recur: task.recur,
            recur_from: task.recur_from,
            parent_id: task.parent_id,
            thought_id: task.thought_id,
            source: task.source,
          })
          .select(TASK_COLUMNS)
          .single();

        if (insErr) {
          return {
            content: [{ type: "text" as const, text: `Completed "${task.title}", but could not create the next instance: ${insErr.message}` }],
            isError: true,
          };
        }

        const next = spawned as TaskRecord;
        return {
          content: [{ type: "text" as const, text: `Completed "${task.title}". Next one due ${next.due_date}. [id: ${next.id}]` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  // Tool 18: Delete Task
  server.registerTool(
    "delete_task",
    {
      title: "Delete Task",
      description:
        "Permanently delete a task and any subtasks under it. This is for mistakes — a task captured twice, or one typed into the wrong place. For something you have decided not to do, set its status to dropped instead, which keeps the record of having decided.",
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
      inputSchema: {
        id: z.string().describe("The id of the task to delete"),
      },
    },
    async ({ id }) => {
      try {
        const { data, error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", id)
          .select("id, title")
          .maybeSingle();

        if (error) {
          return {
            content: [{ type: "text" as const, text: `Could not delete the task: ${error.message}` }],
            isError: true,
          };
        }
        if (!data) {
          return {
            content: [{ type: "text" as const, text: `No task with id "${id}".` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: `Deleted "${(data as { title: string }).title}".` }],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    }
  );

  return server;
}

// --- Hono App with Auth + CORS ---

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-brain-key, accept, mcp-session-id, mcp-protocol-version, last-event-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
};

// JSON-RPC error code for unauthorized requests.
// Per the JSON-RPC 2.0 spec, the range -32099 to -32000 is reserved for
// implementation-defined server errors. -32001 is the conventional
// "Unauthorized" code used by MCP clients/servers in the wild.
//
// Why a JSON-RPC envelope (HTTP 200) instead of a bare HTTP 401?
// Strict MCP hosts (Codex CLI, Claude Code) treat bare HTTP 4xx responses
// as transport-level failures and tear the connection down rather than
// surfacing the failure to the application layer. Wrapping the auth
// rejection in a JSON-RPC error keeps the connection alive and lets
// clients recover (e.g. prompt the user for a new key, refetch a stale
// cache) instead of dying.
const JSON_RPC_UNAUTHORIZED_CODE = -32001;
const UNAUTHORIZED_MESSAGE = "Unauthorized: missing or invalid authentication.";

/**
 * Read the request body as text without consuming the original request's
 * body stream for downstream handlers. Returns null on bodyless methods
 * or read failure.
 */
async function readBodyText(req: Request): Promise<string | null> {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "DELETE") {
    return null;
  }
  try {
    return await req.text();
  } catch {
    return null;
  }
}

/**
 * Best-effort extraction of the JSON-RPC `id` from a raw request body.
 * Returns null when the body is missing, not JSON, or not a JSON-RPC
 * shape with an id. Per the JSON-RPC 2.0 spec, id may be a string,
 * number, or null — we preserve any of those; anything else becomes null.
 */
function extractJsonRpcId(bodyText: string | null): string | number | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    if (parsed && typeof parsed === "object" && "id" in parsed) {
      const id = (parsed as { id: unknown }).id;
      if (typeof id === "string" || typeof id === "number" || id === null) {
        return id;
      }
    }
  } catch {
    // fall through — malformed body
  }
  return null;
}

/**
 * Build a JSON-RPC 2.0 error envelope response for auth failures.
 * Returns HTTP 200 — the JSON-RPC layer expresses the error so that
 * strict MCP clients keep the connection alive instead of treating
 * the failure as a transport-level fault.
 */
function unauthorizedResponse(id: string | number | null): Response {
  const body = {
    jsonrpc: "2.0",
    error: {
      code: JSON_RPC_UNAUTHORIZED_CODE,
      message: UNAUTHORIZED_MESSAGE,
    },
    id,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
  });
}

const app = new Hono();

// CORS preflight — required for browser/Electron-based clients (Claude Desktop, claude.ai)
app.options("*", (c) => {
  return c.text("ok", 200, corsHeaders);
});

app.all("*", async (c) => {
  // Accept access key via header OR URL query parameter
  const provided = c.req.header("x-brain-key") || new URL(c.req.url).searchParams.get("key");
  if (!provided || provided !== MCP_ACCESS_KEY) {
    // Return a JSON-RPC 2.0 error envelope (HTTP 200) instead of a bare
    // HTTP 401 so strict MCP hosts treat this as an application-level
    // error rather than a transport fault and keep the connection alive.
    // Best-effort echo of the inbound request id keeps the response
    // correlated; malformed/missing bodies fall back to id: null.
    const bodyText = await readBodyText(c.req.raw);
    const id = extractJsonRpcId(bodyText);
    return unauthorizedResponse(id);
  }

  // Fix: Claude Desktop connectors don't send the Accept header that
  // StreamableHTTPTransport requires. Build a patched request if missing.
  // See: https://github.com/NateBJones-Projects/OB1/issues/33
  if (!c.req.header("accept")?.includes("text/event-stream")) {
    const headers = new Headers(c.req.raw.headers);
    headers.set("Accept", "application/json, text/event-stream");
    const patched = new Request(c.req.raw.url, {
      method: c.req.raw.method,
      headers,
      body: c.req.raw.body,
      // @ts-ignore -- duplex required for streaming body in Deno
      duplex: "half",
    });
    Object.defineProperty(c.req, "raw", { value: patched, writable: true });
  }

  const server = buildServer();
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  const response = await transport.handleRequest(c);
  if (!response) return c.json({ error: "No response from MCP transport" }, 500, corsHeaders);
  response.headers.delete("mcp-session-id");
  for (const [k, v] of Object.entries(corsHeaders)) response.headers.set(k, v);
  return response;
});

Deno.serve(app.fetch);
