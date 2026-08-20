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

// The controlled vocabulary. It lives in topics.txt at the project root, which
// tidy-archive.py reads to fold aliases — but an edge function has no project
// root at runtime, so the preferred list is duplicated here.
//
// THE TWO COPIES WILL DRIFT, and the drift is invisible: tidy keeps folding
// aliases from topics.txt, so the archive still looks tidy while the prompt
// that decides what gets coined in the first place is the old one. Run
// `python3 tidy-archive.py --check-vocab` after any vocabulary change; it
// compares this list against topics.txt and prints the block to paste back.
// Then redeploy — editing this file changes nothing until you do.
//
// vocabulary:start (generated from topics.txt)
const PREFERRED_TOPICS = [
  "AI",
  "AI Agents",
  "AI Skills",
  "AI tools",
  "AI integration",
  "Automation",
  "Knowledge Management",
  "Knowledge Work",
  "Memory Systems",
  "Productivity",
  "Prompt Engineering",
  "Technology",
  "Token Management",
  "Workflow",
  "prompts",
  "communication",
  "Task management",
  "Team Collaboration",
  "Work Management",
  "AI Solutions Manager",
  "Career Development",
  "job market",
  "Intent Engineering",
  "ChatGPT",
  "Codex",
  "Open Brain",
  "Science",
  "plants",
  "chemical signalling"
];
// vocabulary:end


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

// Vector search answers "what is this about"; it does not answer "which notes
// contain this word". A generic term like "building" is about nothing in
// particular, so it scores below any sensible threshold even when it appears in
// eleven titles. This fills that gap by matching the literal text as well.
async function keywordMatches(query: string, limit: number): Promise<ThoughtMatch[]> {
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
    const { data } = await supabase
      .from("thoughts")
      .select("id, content, metadata, created_at")
      .ilike(column, `%${lead}%`)
      .limit(50);
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
- "topics": array of 1-3 short topic tags (always at least one). These tags are already used here, so reuse one whenever it genuinely describes the note, copied exactly as spelled:
${PREFERRED_TOPICS.join(", ")}
The list is a convenience, not a constraint. It reflects what this archive usually collects, and notes on entirely different subjects are normal and expected. Tag the note for what it is actually about: if that needs a word not on the list, use that word. Never stretch a listed tag to cover something it does not really describe — a wrong tag from the list is the worst outcome of all, worse than any new tag. Never use "Reading", "Work" or "Projects": those are collection tags, applied later from the source.
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
          match_threshold: 0.35,
          match_count: 10,
          filter: {},
        });

        const found = [...((vector || []) as ThoughtMatch[])];
        if (found.length < 10) {
          const have = new Set(found.map((t) => t.id));
          for (const hit of await keywordMatches(query, 10 - found.length)) {
            if (!have.has(hit.id)) found.push(hit);
          }
        }
        const data = found;

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
        format: z
          .enum(["text", "full", "json"])
          .optional()
          .default("text")
          .describe("\"text\" (default) for a compact one-entry-per-match summary — title, type, topics, snippet and id. \"full\" for the complete text of every match (large; prefer fetch on a single id instead). \"json\" for a machine-parseable array of full thought objects (used by the Open Brain Catalog GUI)."),
      },
    },
    async ({ query, limit, threshold, format }) => {
      try {
        const qEmb = await getEmbedding(query);
        const { data: vector, error } = await supabase.rpc("match_thoughts", {
          query_embedding: qEmb,
          match_threshold: threshold,
          match_count: limit,
          filter: {},
        });

        // Top up with literal matches so a plain keyword still finds its notes.
        const found = [...((vector || []) as ThoughtMatch[])];
        if (found.length < limit) {
          const have = new Set(found.map((t) => t.id));
          for (const hit of await keywordMatches(query, limit - found.length)) {
            if (!have.has(hit.id)) found.push(hit);
          }
        }
        const data = found;

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
                  `Use fetch(id) for the full text of one, or fetch(id, max_chars) for its opening.`,
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
        format: z
          .enum(["text", "full", "json"])
          .optional()
          .default("text")
          .describe("\"text\" (default) for a compact one-entry-per-note summary — title, type, topics, snippet and id. \"full\" for the complete text of every note (large; prefer fetch on a single id instead). \"json\" for a machine-parseable array of full thought objects (used by the Open Brain Catalog GUI)."),
      },
    },
    async ({ limit, type, topic, person, days, format }) => {
      try {
        let q = supabase
          .from("thoughts")
          .select("id, content, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(limit);

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
            (t: { id: string; content: string; metadata: Record<string, unknown>; created_at: string }) => ({
              id: t.id,
              content: t.content,
              created_at: t.created_at,
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
                  `Use fetch(id) for the full text of one, or fetch(id, max_chars) for its opening.`,
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
          .select("metadata, created_at")
          .order("created_at", { ascending: false });

        const types: Record<string, number> = {};
        const topics: Record<string, number> = {};
        const people: Record<string, number> = {};

        for (const r of data || []) {
          const m = (r.metadata || {}) as Record<string, unknown>;
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
          `Total thoughts: ${count}`,
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
