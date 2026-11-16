// Tests for checking lists and items before they are stored.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/lists_test.ts

import { checkItemText, checkList, isId, isKind, listsAsText } from "../lists.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

eq("name tidied, kind kept", checkList("  Weekly   shop ", "shopping"), { row: { name: "Weekly shop", kind: "shopping" } });
eq("no kind means checklist", checkList("Bits", undefined), { row: { name: "Bits", kind: "checklist" } });
eq("empty name refused", "problem" in checkList("   ", "ideas"), true);
eq("unknown kind refused", "problem" in checkList("x", "groceries"), true);
eq("prototype names are not kinds", isKind("toString"), false);
eq("long name cut to 80", (checkList("a".repeat(120), "ideas") as { row: { name: string } }).row.name.length, 80);

eq("item tidied", checkItemText(" milk \n and  eggs "), { text: "milk and eggs" });
eq("empty item refused", "problem" in checkItemText(" "), true);
eq("long item cut to 300", (checkItemText("b".repeat(400)) as { text: string }).text.length, 300);

eq("ids checked", [isId("11111111-2222-4333-8444-555555555555"), isId("nope")], [true, false]);

const row = (kind: string) => ({ id: "L", name: "N", kind, created_at: "", updated_at: "" });
const items = [{ id: "a", list_id: "L", text: "One", done: true, position: 1 }, { id: "b", list_id: "L", text: "Two", done: false, position: 2 }];
eq("checklist text shows ticks", listsAsText([{ ...row("shopping"), items } as never]).split("\n").slice(1), ["- [x] One", "- [ ] Two"]);
eq("ranked text is numbered", listsAsText([{ ...row("ranked"), items } as never]).split("\n").slice(1), ["1. One", "2. Two"]);
eq("ideas text is plain", listsAsText([{ ...row("ideas"), items } as never]).split("\n").slice(1), ["- One", "- Two"]);
eq("no lists", listsAsText([]), "No lists yet.");

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
