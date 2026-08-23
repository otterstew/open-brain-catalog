// Tests for the journal helpers — how a check-in answer is titled, tagged,
// stored and, above all, what it gets linked to.
//
// These import the real module rather than carrying a copy of it, so they
// cannot quietly pass against code the server no longer runs.
//
//   deno run supabase/functions/open-brain-mcp/tests/journal_test.ts

import {
  JOURNAL_TYPE,
  JOURNAL_TOPIC,
  humanDate,
  formatJournalContent,
  embeddingText,
  journalTitle,
  journalTopics,
  pickJournalLinks,
} from "../journal.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (String(got) === String(want)) { pass++; }
  else { fail++; console.log(`FAIL ${label}\n  got  ${got}\n  want ${want}`); }
}

// --- dates are written out, never left to the runtime's locale ---
eq("human date", humanDate("2026-08-23"), "23 Aug 2026");
eq("human date no zero pad", humanDate("2026-01-05"), "5 Jan 2026");
eq("human date passthrough", humanDate("not a date"), "not a date");
eq("human date bad month", humanDate("2026-13-01"), "2026-13-01");

// --- the stored entry keeps the question, so the answer stands alone later ---
eq("content", formatJournalContent("2026-08-23", "How are you feeling today?", "  Flat, but fine.  "),
   "**23 Aug 2026 — How are you feeling today?**\n\nFlat, but fine.");
eq("content with mood",
   formatJournalContent("2026-08-23", "How are you feeling today?", "Flat, but fine.", "flat"),
   "**23 Aug 2026 — How are you feeling today?**\n\nFlat, but fine.\n\nMood: flat");
eq("blank mood is not a line",
   formatJournalContent("2026-08-23", "How are you feeling today?", "Fine.", "   "),
   "**23 Aug 2026 — How are you feeling today?**\n\nFine.");

// --- the embedding is taken over the answer, never the shared question ---
eq("embedding text", embeddingText("  Flat, but fine.  "), "Flat, but fine.");
eq("embedding text with mood", embeddingText("Flat.", "flat"), "Flat.\n\nMood: flat");
eq("question is not embedded",
   embeddingText("Flat.").includes("How are you feeling"), false);

// --- titles: dated first so the diary reads as a list ---
eq("title bare", journalTitle("2026-08-23"), "Journal, 23 Aug 2026");
eq("title with extract", journalTitle("2026-08-23", "Anxious about the Wilson pitch"),
   "Journal, 23 Aug 2026 — Anxious about the Wilson pitch");
eq("title ignores empty extract", journalTitle("2026-08-23", "   "), "Journal, 23 Aug 2026");
eq("title ignores non-string extract", journalTitle("2026-08-23", null), "Journal, 23 Aug 2026");
// the extractor sometimes titles it "Journal entry about ..." itself
eq("title does not stamp twice", journalTitle("2026-08-23", "Journal entry — tired again"),
   "Journal, 23 Aug 2026 — tired again");
eq("title strips a bare Journal", journalTitle("2026-08-23", "Journal"), "Journal, 23 Aug 2026");
eq("title leaves a real word starting with journal",
   journalTitle("2026-08-23", "Journalism course, day one"),
   "Journal, 23 Aug 2026 — Journalism course, day one");

// --- the collection tag is always there, and never twice ---
eq("topics adds tag", JSON.stringify(journalTopics(["Work Management"])),
   JSON.stringify([JOURNAL_TOPIC, "Work Management"]));
eq("topics dedupes tag", JSON.stringify(journalTopics(["journal", "Productivity"])),
   JSON.stringify([JOURNAL_TOPIC, "Productivity"]));
eq("topics from nothing", JSON.stringify(journalTopics(undefined)), JSON.stringify([JOURNAL_TOPIC]));
eq("topics ignores junk", JSON.stringify(journalTopics(["", "  ", 7, null])),
   JSON.stringify([JOURNAL_TOPIC]));

// --- linking: the part that decides what a diary entry sits next to ---
const match = (id: string, type = "reference") => ({ id, type });

eq("links top matches",
   JSON.stringify(pickJournalLinks({ candidates: [match("a"), match("b"), match("c"), match("d")] })),
   JSON.stringify(["a", "b", "c"]));

// journal entries are held out: left in, every entry links only to other
// entries about being tired and the diary never reaches the archive
eq("other journal entries are not matched",
   JSON.stringify(pickJournalLinks({
     candidates: [{ id: "j1", type: JOURNAL_TYPE }, match("a"), { id: "j2", type: JOURNAL_TYPE }, match("b")],
   })),
   JSON.stringify(["a", "b"]));

// ...but yesterday's is added back as one deliberate link, so the diary chains
eq("previous entry is chained",
   JSON.stringify(pickJournalLinks({ candidates: [match("a")], previousJournalId: "j1" })),
   JSON.stringify(["j1", "a"]));
eq("no previous entry on the first one",
   JSON.stringify(pickJournalLinks({ candidates: [match("a")], previousJournalId: null })),
   JSON.stringify(["a"]));

// what the caller names is known, not guessed: it is kept and sits outside the
// similarity limit, so naming a meeting cannot push out what the entry is about
eq("explicit ids come first and do not consume the limit",
   JSON.stringify(pickJournalLinks({
     candidates: [match("a"), match("b"), match("c"), match("d")],
     explicitIds: ["meeting-1"],
   })),
   JSON.stringify(["meeting-1", "a", "b", "c"]));

eq("limit is honoured",
   JSON.stringify(pickJournalLinks({ candidates: [match("a"), match("b"), match("c")], limit: 1 })),
   JSON.stringify(["a"]));
eq("auto-link off",
   JSON.stringify(pickJournalLinks({ candidates: [], explicitIds: ["x"] })),
   JSON.stringify(["x"]));

// --- no duplicates, no self-links, no junk ids ---
eq("duplicates collapse",
   JSON.stringify(pickJournalLinks({
     candidates: [match("a"), match("a"), match("b")],
     explicitIds: ["a"],
     previousJournalId: "a",
   })),
   JSON.stringify(["a", "b"]));
eq("cannot link to itself",
   JSON.stringify(pickJournalLinks({ candidates: [match("self"), match("a")], excludeId: "self" })),
   JSON.stringify(["a"]));
eq("blank ids are dropped",
   JSON.stringify(pickJournalLinks({ candidates: [match("  "), match("a")], explicitIds: ["", "  "] })),
   JSON.stringify(["a"]));
eq("ids are trimmed",
   JSON.stringify(pickJournalLinks({ candidates: [], explicitIds: [" a "] })),
   JSON.stringify(["a"]));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error("journal tests failed");
