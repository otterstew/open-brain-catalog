// Tests for what the Today view may see of each calendar event.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/calendar_test.ts

import { addDays, eventBody, londonDayBounds, londonToday, shapeEvents } from "../calendar.ts";

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
eq("work: the title, but no place or people", work[0], { start: "2026-11-05T09:00:00Z", end: "2026-11-05T09:30:00Z", all_day: false, title: "1:1 with a colleague", where: null, calendar: "work" });
eq("work: the place is never passed on", JSON.stringify(work).includes("Room"), false);
eq("work: an untitled meeting reads as Work", shapeEvents([{ start: { dateTime: "2026-11-05T10:00:00Z" }, end: { dateTime: "2026-11-05T10:30:00Z" } }], "work")[0].title, "Work");

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

// Adding an event (5 Nov 2026).
eq("addDays across a month end", addDays("2026-11-30", 1), "2026-12-01");
eq("addDays backwards", addDays("2026-03-01", -1), "2026-02-28");
eq("all-day event ends the next day", eventBody({ title: "Bin day", date: "2026-11-09", all_day: true }),
  { summary: "Bin day", start: { date: "2026-11-09" }, end: { date: "2026-11-10" } });
eq("timed event in London time", eventBody({ title: "Swim", date: "2026-11-09", all_day: false, start: "07:00", end: "08:00", where: "Havre des Pas" }),
  { summary: "Swim", location: "Havre des Pas", start: { dateTime: "2026-11-09T07:00:00", timeZone: "Europe/London" }, end: { dateTime: "2026-11-09T08:00:00", timeZone: "Europe/London" } });
eq("no end: an hour long", (eventBody({ title: "Call", date: "2026-11-09", all_day: false, start: "17:30" }).end as { dateTime: string }).dateTime, "2026-11-09T18:30:00");
eq("late start runs past midnight", (eventBody({ title: "Late", date: "2026-11-09", all_day: false, start: "23:30" }).end as { dateTime: string }).dateTime, "2026-11-10T00:30:00");
eq("end before start is the next day", (eventBody({ title: "Night", date: "2026-11-09", all_day: false, start: "22:00", end: "01:00" }).end as { dateTime: string }).dateTime, "2026-11-10T01:00:00");
for (const [label, bad] of [["no title", { title: " ", date: "2026-11-09", all_day: true }], ["bad date", { title: "x", date: "9/11/2026", all_day: true }], ["bad time", { title: "x", date: "2026-11-09", all_day: false, start: "7am" }]] as const) {
  let threw = false; try { eventBody(bad as never); } catch (_) { threw = true; }
  eq("refuses " + label, threw, true);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
