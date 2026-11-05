// Tests for Today's extras: tides, sunrise and sunset, and what crosses from
// the bookings system.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/briefing_test.ts

import { shapeStays, shapeSun, shapeTides } from "../briefing.ts";

let pass = 0, fail = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) pass++;
  else { fail++; console.log(`FAIL ${label}\n  got  ${g}\n  want ${w}`); }
}

// Jersey Met's shape, as seen live on 5 Nov 2026.
const tidesRaw = [
  { date: "2026-11-05T00:00:00", tideTimes: [
    { time: "15:32", height: "9.5", highLowShort: "HW" },
    { time: "03:13", height: "9.1", highLowShort: "HW" },
    { time: "09:43", height: "3", highLowShort: "LW" },
    { time: "", height: "", highLowShort: "LW" },
  ] },
  { date: "2026-11-06T00:00:00", tideTimes: [{ time: "4:01", height: "8.8", highLowShort: "HW" }] },
];
const t = shapeTides(tidesRaw, "2026-11-05");
eq("tides: in time order", t.map((x) => x.time), ["03:13", "09:43", "15:32"]);
eq("tides: high and low, heights as numbers", t[1], { time: "09:43", height_m: 3, type: "low" });
eq("tides: a blank row is left out", t.length, 3);
eq("tides: a one-digit hour is padded", shapeTides(tidesRaw, "2026-11-06")[0].time, "04:01");
eq("tides: a day not in the feed is empty", shapeTides(tidesRaw, "2026-12-25"), []);
let threw = false;
try { shapeTides({ error: "x" }, "2026-11-05"); } catch (_) { threw = true; }
eq("tides: an odd answer is an error, not silence", threw, true);

const sunRaw = { daily: { time: ["2026-11-05"], sunrise: ["2026-11-05T07:02"], sunset: ["2026-11-05T16:41"] } };
eq("sun: times as HH:MM", shapeSun(sunRaw, "2026-11-05"), { sunrise: "07:02", sunset: "16:41" });
eq("sun: another day is null", shapeSun(sunRaw, "2026-11-06"), null);
eq("sun: nonsense is null", shapeSun(null, "2026-11-05"), null);

const stays = shapeStays({
  tasks: [{
    id: "abc", kind: "welcome_message", label: "Welcome WhatsApp", due_on: "2026-11-05", days_until_due: 0,
    gite: "La Grange", guest_name: "A Guest", checkin: "2026-11-06", checkout: "2026-11-10",
    contact: "WhatsApp number on file", same_day_arrival: false, turnover_by: null,
    phone: "+33 6 00 00 00 00", email: "guest@example.com",
  }],
  movements: [{ kind: "arrival", gite: "La Grange", guest_name: "A Guest", phone: "x" }, { kind: "odd", gite: "?" }],
});
eq("stays: the task keeps what Today shows", stays.tasks[0].label + " · " + stays.tasks[0].gite, "Welcome WhatsApp · La Grange");
eq("stays: no phone or email ever crosses", JSON.stringify(stays).includes("+33") || JSON.stringify(stays).includes("@"), false);
eq("stays: only arrivals and departures", stays.movements.length, 1);
eq("stays: an empty answer is empty lists", shapeStays(null), { tasks: [], movements: [] });

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
