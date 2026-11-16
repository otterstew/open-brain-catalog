// Tests for Today's extras: tides, sunrise and sunset, and what crosses from
// the bookings system.
//   deno run --no-config supabase/functions/open-brain-mcp/tests/briefing_test.ts

import { decodeEntities, senderName, shapeStayMail, shapeStays, shapeSun, shapeTides } from "../briefing.ts";

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

// French rentals mail (16 Nov 2026): Gmail threads, format=metadata.
const hdr = (from: string, subject: string) => ({ headers: [{ name: "From", value: from }, { name: "Subject", value: subject }] });
const mail = shapeStayMail([
  { id: "a1", messages: [{ labelIds: ["UNREAD", "INBOX", "Label_5"], snippet: "has replied &quot;change&quot; &amp; more", internalDate: "1794782607000",
    payload: hdr('"Willeke Van den Boogaart" <sender@messages.example.com>', "Reservation from Willeke") }] },
  { id: "b2", messages: [
    { labelIds: ["INBOX"], internalDate: "1794000000000", payload: hdr("Guest <g@example.com>", "Question") },
    { labelIds: ["SENT"], internalDate: "1794100000000", payload: hdr("Stewart <me@example.com>", "Re: Question") },
  ] },
  { id: "c3", messages: [{ labelIds: ["UNREAD"], internalDate: "1794750296000", payload: hdr("noreply@vrbo.example.com", "Reservation from Marius") }] },
  { messages: [] },
]);
eq("mail: answered threads (last message SENT) are left out", mail.map((m) => m.id), ["a1", "c3"]);
eq("mail: newest first, London date", mail[0].date, "2026-11-15");
eq("mail: sender is the display name only", mail[0].from, "Willeke Van den Boogaart");
eq("mail: a bare address keeps only the part before @", mail[1].from, "noreply");
eq("mail: no address ever crosses", JSON.stringify(mail).includes("@"), false);
eq("mail: snippet entities decoded", mail[0].snippet, 'has replied "change" & more');
eq("mail: inbox and unread flags", [mail[0].in_inbox, mail[0].unread, mail[1].in_inbox], [true, true, false]);
eq("mail: link opens the thread", mail[0].url, "https://mail.google.com/mail/u/0/#all/a1");
eq("mail: numeric entities", decodeEntities("it&#39;s &#x2014;"), "it's \u2014");
eq("mail: plain name passes", senderName("Office de Tourisme"), "Office de Tourisme");

console.log(`${pass} passed, ${fail} failed`);
if (fail) Deno.exit(1);
