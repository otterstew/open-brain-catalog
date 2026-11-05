// Tests for the Sorter's clean-up and fallback.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/inbox_test.ts

import { fallbackSuggestion, normaliseSuggestion, sorterPrompt } from "../inbox.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

// A good task suggestion passes through, project kept because it exists.
const t = normaliseSuggestion(
  { kind: "task", title: " Book  the dentist ", due_date: "2026-11-07", project: "house", tags: ["x"], why: "It says need to." },
  "need to book the dentist by friday", ["house", "open brain"]);
eq("task kind", t.kind, "task");
eq("task title tidied", t.title, "Book the dentist");
eq("task due date kept", t.due_date, "2026-11-07");
eq("task project kept", t.project, "house");
eq("task has no tags", t.tags, []);
eq("why kept", t.why, "It says need to.");

// Made-up project and impossible date are dropped.
const t2 = normaliseSuggestion({ kind: "task", title: "Pay", due_date: "2026-02-31", project: "garden" }, "pay", ["house"]);
eq("unknown project dropped", t2.project, null);
eq("impossible date dropped", t2.due_date, null);

// A note keeps at most three distinct tags and its type; no due date.
const n = normaliseSuggestion(
  { kind: "note", title: "Octopus minds", tags: ["Books", "Books", "Animals", "Mind", "Extra"], note_type: "idea", due_date: "2026-11-07" },
  "octopuses have neurons in their arms");
eq("note tags deduped and capped", n.tags, ["Books", "Animals", "Mind"]);
eq("note type kept", n.note_type, "idea");
eq("note has no due date", n.due_date, null);

// A journal line has no tags or project.
const j = normaliseSuggestion({ kind: "journal", title: "A good swim", tags: ["Swim"], project: "house" }, "Today I swam at Havre des Pas", ["house"]);
eq("journal kind", j.kind, "journal");
eq("journal no tags", j.tags, []);
eq("journal no project", j.project, null);

// Rubbish from the model: falls back to the words.
const bad = normaliseSuggestion("nonsense", "remember to ring the plumber\nabout the boiler");
eq("unknown kind falls back by words", bad.kind, "task");
eq("missing title uses first line", bad.title, "remember to ring the plumber");

// Photo and recording links are not used as a title.
const p = normaliseSuggestion({ kind: "note" }, "![page](photo:2026/11/abc.jpg) Some printed words");
eq("photo link left out of title", p.title, "Some printed words");

// Fallback guesses.
eq("fallback task", fallbackSuggestion("Need to renew the car insurance").kind, "task");
eq("fallback journal", fallbackSuggestion("Today I felt tired after the run").kind, "journal");
eq("fallback note", fallbackSuggestion("The Light Eaters is about plant intelligence").kind, "note");
eq("fallback marked", fallbackSuggestion("x").by, "fallback");

// The prompt names the weekday, the projects and the tags.
const pr = sorterPrompt("2026-11-05", ["Books", "AI"], ["house"]);
eq("prompt has weekday", pr.includes("Thursday 2026-11-05"), true);
eq("prompt has project", pr.includes("house"), true);
eq("prompt has tags", pr.includes("Books, AI"), true);

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
