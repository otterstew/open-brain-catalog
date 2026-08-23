// --- Journal ---
//
// The Life Engine's midday check-in asks "How are you feeling today?" over
// Telegram, and the answer comes back here. A journal entry is not a captured
// article and should not be filed like one: it is dated, it is the owner's own
// words, and almost all of its later value comes from sitting next to whatever
// it was actually about — the meeting that went badly, the person it names,
// yesterday's entry.
//
// So journal entries get their own type rather than being flattened into
// "observation", a title stamped with the day rather than one guessed from the
// text, and their links found for them at capture time. Nobody goes back and
// links a diary by hand.
//
// Everything in this module is pure: no database, no network, no clock. The
// server does the I/O and calls in here for every decision, so the decisions
// can be tested (tests/journal_test.ts) without a deployment.

export const JOURNAL_TYPE = "journal";

// A collection tag, applied from the source rather than inferred from the
// text — the same job "Reading" does for captured articles. It is what makes
// list_thoughts(topic: "Journal") a diary.
export const JOURNAL_TOPIC = "Journal";

export const DEFAULT_JOURNAL_QUESTION = "How are you feeling today?";

// Deliberately above the 0.35 used for ordinary search. Search is answering
// "show me what might be relevant" for a human who can ignore the misses;
// this is writing a permanent link into two notes unsupervised, and a wrong
// link is worse than a missing one because it stays.
export const JOURNAL_LINK_THRESHOLD = 0.45;

// Three is a diary entry with context. Ten is a diary entry buried in it.
export const JOURNAL_LINK_COUNT = 3;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-08-23" -> "23 Aug 2026". Written out rather than using toLocaleDateString
// because the server's locale is whatever the edge runtime happens to have, and
// a title that renders as 8/23/2026 for one entry and 23/08/2026 for the next
// makes the diary unreadable as a list.
export function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso;
  return `${Number(m[3])} ${month} ${m[1]}`;
}

// What gets stored and read back later. The question is kept because an answer
// alone ("fine, a bit flat") is not a standalone thought six months on — it
// does not say what was being asked.
export function formatJournalContent(
  entryDate: string,
  question: string,
  answer: string,
  mood?: string,
): string {
  const lines = [`**${humanDate(entryDate)} — ${question.trim()}**`, "", answer.trim()];
  if (mood && mood.trim()) lines.push("", `Mood: ${mood.trim()}`);
  return lines.join("\n");
}

// The embedding is taken over the answer alone, NOT over the content above.
// Every entry carries the same question, and a shared preamble drags every
// entry's vector towards every other entry's — which is precisely the axis
// this note must not be similar along, since the whole point of the linking
// below is to find the notes an entry is about rather than other days on which
// somebody was tired.
export function embeddingText(answer: string, mood?: string): string {
  const trimmed = answer.trim();
  return mood && mood.trim() ? `${trimmed}\n\nMood: ${mood.trim()}` : trimmed;
}

// Dated first, so a list of entries reads as a diary; the extractor's title
// after it, so it is still possible to tell one Tuesday from another.
export function journalTitle(entryDate: string, extractedTitle?: unknown): string {
  const base = `Journal, ${humanDate(entryDate)}`;
  const raw = typeof extractedTitle === "string" ? extractedTitle.trim() : "";
  // The extractor sometimes titles the entry "Journal entry — tired again" on
  // its own. Stamping the word twice reads badly, and a title of nothing but
  // "Journal" leaves a dangling dash, so strip the prefix and fall back to the
  // date alone when there is nothing left.
  const extra = raw.replace(/^journal(\s+entry)?\b[\s—–:,-]*/i, "").trim();
  if (!extra) return base;
  return `${base} — ${extra}`;
}

export function journalTopics(extracted: unknown): string[] {
  const raw = Array.isArray(extracted) ? extracted.filter((t): t is string => typeof t === "string") : [];
  const kept = raw.map((t) => t.trim()).filter(Boolean)
    .filter((t) => t.toLowerCase() !== JOURNAL_TOPIC.toLowerCase());
  return [JOURNAL_TOPIC, ...kept];
}

export type LinkCandidate = { id: string; type?: unknown; similarity?: number };

// Which notes this entry gets linked to, given what the vector search returned.
//
// Journal entries are held out of the search results. "Still flat, the pitch is
// hanging over me" resembles every other entry about being flat far more than
// it resembles the note about the pitch, so left in they take every slot and
// the diary links only to itself, forever. Yesterday's entry is then added back
// deliberately as a single link, so the diary still reads as a chain — one
// link, from the newest entry, not a similarity match.
//
// Ids the caller passed explicitly come first and are never dropped: the Life
// Engine knows what it just prepped the user for, and that beats a guess.
export function pickJournalLinks(opts: {
  candidates: LinkCandidate[];
  explicitIds?: string[];
  previousJournalId?: string | null;
  limit?: number;
  excludeId?: string | null;
}): string[] {
  const limit = opts.limit ?? JOURNAL_LINK_COUNT;
  const out: string[] = [];
  const seen = new Set<string>();
  if (opts.excludeId) seen.add(opts.excludeId);

  const add = (id: unknown): boolean => {
    if (typeof id !== "string") return false;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return false;
    seen.add(trimmed);
    out.push(trimmed);
    return true;
  };

  for (const id of opts.explicitIds || []) add(id);
  add(opts.previousJournalId);

  // The limit counts matches found by similarity, which are the guesses. What
  // the caller named, and yesterday's entry, are known and sit outside it.
  let taken = 0;
  for (const c of opts.candidates) {
    if (taken >= limit) break;
    if (c.type === JOURNAL_TYPE) continue;
    if (add(c.id)) taken++;
  }
  return out;
}
