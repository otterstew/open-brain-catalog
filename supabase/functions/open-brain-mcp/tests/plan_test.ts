// Tests for checking a Morning plan before it is stored.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/plan_test.ts

import { checkPlan, isDay } from "../plan.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

const TASK = "11111111-2222-4333-8444-555555555555";
const ok = checkPlan("2026-11-05", [
  { start: "18:30", minutes: 30, title: "  Renew the  car tax ", task_id: TASK },
  { start: "7:15", minutes: 45, title: "Write", task_id: null },
]);
eq("good plan stored in time order", "rows" in ok ? ok.rows.map((r) => r.start_time) : ok, ["07:15", "18:30"]);
eq("title tidied, task kept", "rows" in ok ? [ok.rows[1].title, ok.rows[1].task_id] : ok, ["Renew the car tax", TASK]);
eq("empty plan is allowed (clears the day)", checkPlan("2026-11-05", []), { rows: [] });

eq("bad day", "problem" in checkPlan("2026-02-30", []), true);
eq("bad start", "problem" in checkPlan("2026-11-05", [{ start: "25:00", minutes: 30, title: "x" }]), true);
eq("too short", "problem" in checkPlan("2026-11-05", [{ start: "09:00", minutes: 2, title: "x" }]), true);
eq("no title", "problem" in checkPlan("2026-11-05", [{ start: "09:00", minutes: 30, title: "  " }]), true);
eq("not a task id", "problem" in checkPlan("2026-11-05", [{ start: "09:00", minutes: 30, title: "x", task_id: "abc" }]), true);
eq("isDay real", isDay("2026-11-05"), true);
eq("isDay not real", isDay("2026-13-01"), false);

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
