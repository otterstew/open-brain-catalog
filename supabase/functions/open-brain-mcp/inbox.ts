// --- The Inbox and its Sorter (5 Nov 2026) ---
//
// Everything Stewart captures in a hurry lands in the inbox table as it was
// typed, spoken or photographed. The Sorter reads each item once and suggests
// where it belongs: a task (with a due date or project if the words give one),
// a line in today's journal, or a note (with a title and tags). It only
// suggests. The catalog shows the suggestion and files the item when Stewart
// taps, so nothing becomes a note or task on its own.
//
// This file holds the parts that can be tested without a network: the prompt,
// the clean-up of what the model sends back, and a plain fallback for when
// the model cannot be reached.

export const INBOX_KINDS = ["task", "journal", "note"] as const;
export type InboxKind = typeof INBOX_KINDS[number];
export const FILED_AS = ["task", "journal", "note", "dropped"] as const;
export const NOTE_TYPES = ["observation", "idea", "reference", "person_note"] as const;
export const SORTER_MODEL = "openai/gpt-4o-mini";

export interface Suggestion {
  kind: InboxKind;
  title: string;
  due_date: string | null;
  project: string | null;
  tags: string[];
  note_type: string;
  why: string;
  by: "sorter" | "fallback";
}

export interface InboxRow {
  id: string;
  content: string;
  source: string;
  created_at: string;
  suggestion: Suggestion | null;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function sorterPrompt(today: string, tags: string[], projects: string[]): string {
  const d = new Date(today + "T12:00:00Z");
  const weekday = WEEKDAYS[d.getUTCDay()];
  return `You sort one item from a personal capture inbox. The owner jotted it down quickly (typed, spoken or photographed) and will file it with one tap, so suggest the single most likely home. Today is ${weekday} ${today}.

Return JSON with:
- "kind": one of
  "task" — something the owner has to do (a chore, an errand, a reply, a booking, "remember to ...").
  "journal" — about the owner's own day, mood, health, a conversation or event they lived through, written in the first person about today or yesterday.
  "note" — something worth remembering or looking up later: an idea, a fact, a quote, a link, a book, a recipe, a thought about a subject.
- "title": for a task, the task in one short line as the owner would say it ("Book the dentist"). For a note, a short descriptive title under 10 words. For a journal line, a few words saying what it is about.
- "due_date": a task's due date as YYYY-MM-DD only if the words give one ("by Friday", "tomorrow", "on the 12th"), worked out from today. Otherwise null. Always null for notes and journal lines.
- "project": for a task, one of these existing projects if it clearly belongs to one, copied exactly: ${projects.length ? projects.join(", ") : "(none yet)"}. Otherwise null.
- "tags": for a note, 1 to 3 short topic tags, reusing these existing ones when they truly fit, copied exactly: ${tags.slice(0, 120).join(", ") || "(none yet)"}. Empty for tasks and journal lines.
- "note_type": for a note, one of "observation", "idea", "reference", "person_note". Otherwise "observation".
- "why": one short plain sentence saying why, for the owner to read ("It says 'need to' and names a day").
Write in British English. Never invent details that are not in the item.`;
}

function isoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? v.trim() : null;
}

function firstLine(text: string, max: number): string {
  const line = text.trim().split("\n").find((l) => l.trim()) || "";
  const clean = line.replace(/!\[[^\]]*\]\([^)]*\)|\[[^\]]*\]\(audio:[^)]*\)/g, "").trim();
  return clean.length > max ? clean.slice(0, max - 1).trimEnd() + "…" : clean;
}

// Whatever the model sent, turn it into a suggestion the catalog can trust:
// a known kind, a title, a real date or none, at most three tags.
export function normaliseSuggestion(raw: unknown, content: string, projects: string[] = []): Suggestion {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kind = INBOX_KINDS.includes(r.kind as InboxKind) ? r.kind as InboxKind : fallbackSuggestion(content).kind;
  let title = typeof r.title === "string" ? r.title.trim().replace(/\s+/g, " ") : "";
  if (!title) title = firstLine(content, 80) || "Untitled";
  if (title.length > 120) title = title.slice(0, 119).trimEnd() + "…";
  const project = kind === "task" && typeof r.project === "string" && projects.includes(r.project.trim())
    ? r.project.trim() : null;
  const tags = kind === "note" && Array.isArray(r.tags)
    ? [...new Set(r.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => (t as string).trim().slice(0, 40)))].slice(0, 3)
    : [];
  const note_type = NOTE_TYPES.includes(r.note_type as typeof NOTE_TYPES[number]) ? r.note_type as string : "observation";
  const why = typeof r.why === "string" ? r.why.trim().slice(0, 200) : "";
  return {
    kind,
    title,
    due_date: kind === "task" ? isoDate(r.due_date) : null,
    project,
    tags,
    note_type: kind === "note" ? note_type : "observation",
    why,
    by: "sorter",
  };
}

// When the model cannot be reached: a plain guess from the words, marked as
// such so the catalog can say so.
export function fallbackSuggestion(content: string): Suggestion {
  const t = content.trim().toLowerCase();
  const task = /^(remember to|need to|must|todo|to do|call|ring|email|reply|book|buy|pay|fix|send|ask|check|pick up|get|order|renew|cancel)\b/.test(t)
    || /\b(need to|have to|must|remember to|don't forget)\b/.test(t);
  const journal = !task && /^(today|this morning|this afternoon|this evening|tonight|yesterday|i felt|i feel|feeling|i'm feeling|had a|went to|i went)\b/.test(t);
  const kind: InboxKind = task ? "task" : journal ? "journal" : "note";
  return {
    kind,
    title: firstLine(content, 80) || "Untitled",
    due_date: null,
    project: null,
    tags: [],
    note_type: "observation",
    why: "",
    by: "fallback",
  };
}
