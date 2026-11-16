// --- Lists (16 Nov 2026) ---
//
// Named lists Stewart makes himself in the catalog's Lists tab: a shopping
// list, what to pack, things to read or watch, ideas, a ranking. Each list has
// a kind, which decides how its items behave (ticked off, or just written
// down, or numbered in order). They are not tasks: nothing here has a due date
// or shows on Today, and the nightly sweep never touches them. This file
// checks what is stored; index.ts holds the tools.

export const LIST_KINDS = {
  checklist: { label: "Checklist", ticks: true, numbered: false },
  shopping: { label: "Shopping", ticks: true, numbered: false },
  packing: { label: "Packing", ticks: true, numbered: false },
  watch: { label: "To read or watch", ticks: true, numbered: false },
  ideas: { label: "Ideas", ticks: false, numbered: false },
  ranked: { label: "Ranked", ticks: false, numbered: true },
} as const;

export type ListKind = keyof typeof LIST_KINDS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
export const isKind = (v: unknown): v is ListKind => typeof v === "string" && Object.hasOwn(LIST_KINDS, v);

const tidy = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);

// A list's name and kind, ready to store, or the problem in plain words.
export function checkList(name: unknown, kind: unknown): { row: { name: string; kind: ListKind } } | { problem: string } {
  const n = tidy(name, 80);
  if (!n) return { problem: "a list needs a name" };
  const k = kind === undefined || kind === null || kind === "" ? "checklist" : kind;
  if (!isKind(k)) return { problem: `kind must be one of ${Object.keys(LIST_KINDS).join(", ")}` };
  return { row: { name: n, kind: k } };
}

// One item's words. Items are a line each, so line breaks fold to spaces.
export function checkItemText(text: unknown): { text: string } | { problem: string } {
  const t = tidy(text, 300);
  return t ? { text: t } : { problem: "an item needs some words" };
}

export interface ListItemRow { id: string; list_id: string; text: string; done: boolean; position: number }
export interface ListRow { id: string; name: string; kind: ListKind; created_at: string; updated_at: string }

// The text answer for an AI client: each list with its items, ticked ones marked.
export function listsAsText(lists: (ListRow & { items: ListItemRow[] })[]): string {
  if (!lists.length) return "No lists yet.";
  return lists.map((l) => {
    const k = LIST_KINDS[l.kind] ?? LIST_KINDS.checklist;
    const items = l.items.map((it, i) =>
      k.numbered ? `${i + 1}. ${it.text}` : k.ticks ? `- [${it.done ? "x" : " "}] ${it.text}` : `- ${it.text}`);
    return `## ${l.name} (${k.label}, id ${l.id})\n` + (items.length ? items.join("\n") : "(empty)");
  }).join("\n\n");
}
