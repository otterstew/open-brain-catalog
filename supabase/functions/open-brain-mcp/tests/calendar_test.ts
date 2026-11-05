// Tests for what the Today view may see of each calendar event.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/calendar_test.ts

import { londonDayBounds, londonToday, shapeEvents } from "../calendar.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

const work = shapeEvents([
  { summary: "1:1 with a colleague", location: "Room 4", start: { dateTime: "2026-11-05T09:00:00Z" }, end: { dateTime: "2026-11-05T09:30:00Z" },
    attendees: [{ self: true, responseStatus: "accepted" }] },
  { summary: "Annual leave", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } },
  { summary: "Declined meeting", start: { dateTime: "2026-11-05T11:00:00Z" }, end: { dateTime: "2026-11-05T12:00:00Z" },
    attendees: [{ self: true, responseStatus: "declined" }] },
  { summary: "Focus (free)", transparency: "transparent", start: { dateTime: "2026-11-05T13:00:00Z" }, end: { dateTime: "2026-11-05T14:00:00Z" } },
  { summary: "Cancelled", status: "cancelled", start: { dateTime: "2026-11-05T15:00:00Z" }, end: { dateTime: "2026-11-05T16:00:00Z" } },
], "work");
eq("work: only the real busy time", work.length, 1);
eq("work: no title, place or people", work[0], { start: "2026-11-05T09:00:00Z", end: "2026-11-05T09:30:00Z", all_day: false, title: "Work", where: null, calendar: "work" });
eq("work: nothing of the original words anywhere", JSON.stringify(work).includes("colleague") || JSON.stringify(work).includes("Room"), false);

const personal = shapeEvents([
  { summary: "Swim", location: "Havre des Pas", start: { dateTime: "2026-11-05T07:00:00Z" }, end: { dateTime: "2026-11-05T08:00:00Z" } },
  { summary: "Bin day", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } },
  { start: { dateTime: "2026-11-05T18:00:00Z" }, end: { dateTime: "2026-11-05T19:00:00Z" } },
], "personal");
eq("personal: all-day first", personal[0].title, "Bin day");
eq("personal: all-day flag", personal[0].all_day, true);
eq("personal: title and place kept", [personal[1].title, personal[1].where], ["Swim", "Havre des Pas"]);
eq("personal: untitled named plainly", personal[2].title, "(no title)");

// London day bounds across the clocks: GMT in November, BST in July.
eq("winter day starts at midnight UTC", londonDayBounds("2026-11-05"), { min: "2026-11-05T00:00:00.000Z", max: "2026-11-06T00:00:00.000Z" });
eq("summer day starts at 23:00 UTC", londonDayBounds("2026-07-10"), { min: "2026-07-09T23:00:00.000Z", max: "2026-07-10T23:00:00.000Z" });
eq("clocks-go-back day is 25 hours", londonDayBounds("2026-10-25"), { min: "2026-10-24T23:00:00.000Z", max: "2026-10-26T00:00:00.000Z" });
eq("late evening UTC in summer is already tomorrow in London", londonToday(new Date("2026-07-10T23:30:00Z")), "2026-07-11");

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
