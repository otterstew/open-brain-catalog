// Tests for splitting long notes into searchable pieces.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/chunks_test.ts

import { CHUNK_CHARS, chunkText } from "../chunks.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

eq("short note is one piece", chunkText("hello"), ["hello"]);
eq("exactly the size is one piece", chunkText("a".repeat(CHUNK_CHARS)).length, 1);

// A long note of paragraphs: every piece within size, cuts on paragraph breaks,
// the pieces overlap, and together they cover every character.
const para = (i: number) => `Paragraph ${i}. ` + "word ".repeat(60).trim();
const doc = Array.from({ length: 120 }, (_, i) => para(i)).join("\n\n");
const pieces = chunkText(doc);
eq("long note splits", pieces.length > 1, true);
eq("no piece over the size", pieces.every((p) => p.length <= CHUNK_CHARS), true);
eq("cuts land after a paragraph break", pieces.slice(0, -1).every((p) => p.endsWith("\n\n")), true);
eq("first piece starts the note", doc.startsWith(pieces[0]), true);
eq("last piece ends the note", doc.endsWith(pieces[pieces.length - 1]), true);
let covered = true, pos = 0;
for (const p of pieces) {
  const at = doc.indexOf(p, Math.max(0, pos - 2000));
  if (at < 0 || at > pos) covered = false;
  pos = at + p.length;
}
eq("pieces cover the whole note in order", covered && pos === doc.length, true);

// Text with no breaks at all still splits, and still makes progress.
const blob = "x".repeat(20000);
const b = chunkText(blob);
eq("unbroken text splits", b.length, 4);
eq("unbroken text: hard cuts at the size", b.slice(0, -1).every((p) => p.length === CHUNK_CHARS), true);

// The note that started this: 88,686 characters becomes about fifteen pieces.
eq("longest note: ~15 pieces", Math.abs(chunkText("lorem ipsum ".repeat(7391)).length - 16) <= 1, true);

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) Deno.exit(1);
