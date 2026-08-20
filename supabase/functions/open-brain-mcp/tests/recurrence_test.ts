// Tests for the task date and recurrence helpers.
//
// These import the real module rather than carrying a copy of it, so they
// cannot quietly pass against code the server no longer runs.
//
//   deno run supabase/functions/open-brain-mcp/tests/recurrence_test.ts

import {
  parseISODate,
  formatISODate,
  parseRecur,
  nextRecurrence,
} from "../tasks.ts";

// ---- tests ----
let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (String(got) === String(want)) { pass++; }
  else { fail++; console.log(`FAIL ${label}\n  got  ${got}\n  want ${want}`); }
}

// next due date, given a repeat rule, a base date and "today"
function nd(rule: string, base: string, today: string): string {
  const spec = parseRecur(rule)!;
  return formatISODate(nextRecurrence(spec, parseISODate(base)!, parseISODate(today)!));
}

// --- plain intervals ---
eq("daily", nd("daily", "2026-08-20", "2026-08-20"), "2026-08-21");
eq("weekly", nd("weekly", "2026-08-20", "2026-08-20"), "2026-08-27");
eq("fortnightly", nd("fortnightly", "2026-08-20", "2026-08-20"), "2026-09-03");
eq("every 3 days", nd("every 3 days", "2026-08-20", "2026-08-20"), "2026-08-23");
eq("every 6 months", nd("every 6 months", "2026-08-20", "2026-08-20"), "2027-02-20");
eq("quarterly", nd("quarterly", "2026-08-20", "2026-08-20"), "2026-11-20");
eq("yearly", nd("yearly", "2026-08-20", "2026-08-20"), "2027-08-20");

// --- month-end clamping: 31 Jan + 1 month is 28 Feb, not 3 March ---
eq("31 Jan monthly", nd("monthly", "2026-01-31", "2026-01-31"), "2026-02-28");
eq("31 Jan monthly leap", nd("monthly", "2028-01-31", "2028-01-31"), "2028-02-29");
eq("31 Mar monthly", nd("monthly", "2026-03-31", "2026-03-31"), "2026-04-30");
// 29 Feb yearly on a non-leap year clamps to 28 Feb
eq("29 Feb yearly", nd("yearly", "2028-02-29", "2028-02-29"), "2029-02-28");

// --- overdue tasks must not spawn another overdue copy ---
// weekly, due three weeks ago, completed today -> next week, not 2 weeks ago
eq("overdue weekly", nd("weekly", "2026-07-30", "2026-08-20"), "2026-08-27");
eq("overdue daily", nd("daily", "2026-01-01", "2026-08-20"), "2026-08-21");
eq("overdue monthly", nd("monthly", "2025-11-15", "2026-08-20"), "2026-09-15");

// --- named weekdays ---
// 2026-08-20 is a Thursday
eq("weekday sanity", parseISODate("2026-08-20")!.getUTCDay(), 4);
eq("every friday", nd("every friday", "2026-08-20", "2026-08-20"), "2026-08-21");
eq("every thursday (same day -> next week)", nd("every thursday", "2026-08-20", "2026-08-20"), "2026-08-27");
eq("every monday", nd("every monday", "2026-08-20", "2026-08-20"), "2026-08-24");

// --- weekdays only, never lands on a weekend ---
// Friday 2026-08-21 -> Monday 2026-08-24
eq("weekdays over weekend", nd("weekdays", "2026-08-21", "2026-08-21"), "2026-08-24");
eq("weekdays midweek", nd("weekdays", "2026-08-20", "2026-08-20"), "2026-08-21");

// --- rules we do not understand must be refused, not silently ignored ---
eq("unparseable", parseRecur("every second tuesday of the month"), "null");
eq("empty", parseRecur(""), "null");
eq("nonsense", parseRecur("sometimes"), "null");
eq("zero interval", parseRecur("every 0 days"), "null");
eq("case + spacing", JSON.stringify(parseRecur("  EVERY  2   Weeks ")), '{"kind":"interval","unit":"week","n":2}');

// --- date parsing rejects impossible dates rather than rolling them forward ---
eq("31 Feb refused", parseISODate("2026-02-31"), "null");
eq("month 13 refused", parseISODate("2026-13-01"), "null");
eq("short form refused", parseISODate("2026-8-1"), "null");
eq("valid parses", formatISODate(parseISODate("2026-02-28")!), "2026-02-28");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error("recurrence tests failed");
