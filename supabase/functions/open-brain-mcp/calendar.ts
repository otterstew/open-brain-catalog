// --- Calendars for the catalog's Today view (5 Nov 2026) ---
//
// Reads the same Google calendars as the Life Engine's morning briefing, with
// the same Google sign-in (the GOOGLE_OAUTH_* secrets, shared by every
// function in this project). Which calendars is configuration, not code: this
// file is mirrored to a public repo, so the calendar ids live in secrets,
// CALENDAR_WORK_ID and CALENDAR_PERSONAL_IDS (comma-separated).
//
// Work events come back with their titles but no places or people. At first
// they were plain "Work" busy blocks (his choice, 5 Nov 2026, as he
// screen-shares Open Brain at work); later that day he asked to see the
// titles. Today and the Morning plan are hidden in the catalog's work mode,
// which is what keeps them off a shared screen. All-day work entries
// (colleagues' leave, rental holds) are still left out, since they are not
// time he is busy.

export const TIMEZONE = "Europe/London";

export interface RawEvent {
  summary?: string;
  location?: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export interface DayEvent {
  start: string;      // ISO datetime, or YYYY-MM-DD when all_day
  end: string;
  all_day: boolean;
  title: string;
  where: string | null;
  calendar: "personal" | "work";
}

// The pure part: what the catalog may see of each event.
export function shapeEvents(raw: RawEvent[], calendar: "personal" | "work"): DayEvent[] {
  const out: DayEvent[] = [];
  for (const e of raw) {
    if (e.status === "cancelled") continue;
    const start = e.start?.dateTime ?? e.start?.date;
    const end = e.end?.dateTime ?? e.end?.date ?? start;
    if (!start || !end) continue;
    const allDay = !e.start?.dateTime;
    const me = (e.attendees || []).find((a) => a.self);
    if (me?.responseStatus === "declined") continue;
    if (calendar === "work") {
      if (allDay || e.transparency === "transparent") continue;
      out.push({ start, end, all_day: false, title: (e.summary || "").trim() || "Work", where: null, calendar });
    } else {
      out.push({
        start, end, all_day: allDay,
        title: (e.summary || "").trim() || "(no title)",
        where: e.location?.trim() || null,
        calendar,
      });
    }
  }
  return out.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start));
}

// Midnight-to-midnight in London for a YYYY-MM-DD, as UTC instants.
export function londonDayBounds(date: string): { min: string; max: string } {
  const offsetAt = (iso: string) => {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, timeZoneName: "shortOffset" })
      .formatToParts(new Date(iso)).find((p) => p.type === "timeZoneName")?.value || "GMT";
    const m = /GMT([+-])(\d{1,2})(?::(\d\d))?/.exec(name);
    return m ? (m[1] === "-" ? -1 : 1) * (+m[2] * 60 + +(m[3] || 0)) : 0;
  };
  const at = (d: string) => {
    const guess = new Date(d + "T00:00:00Z");
    return new Date(guess.getTime() - offsetAt(guess.toISOString()) * 60_000).toISOString();
  };
  const next = new Date(date + "T12:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return { min: at(date), max: at(next.toISOString().slice(0, 10)) };
}

export function londonToday(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

// --- The network part ---

let cachedToken: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.until > Date.now() + 30_000) return cachedToken.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "",
      refresh_token: Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN") || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}); the Life Engine's briefing will be missing its calendar too`);
  const d = await res.json();
  cachedToken = { token: d.access_token, until: Date.now() + d.expires_in * 1000 };
  return cachedToken.token;
}

async function listRaw(calendarId: string, min: string, max: string, limit = 100): Promise<RawEvent[]> {
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", min);
  url.searchParams.set("timeMax", max);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(limit));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (!res.ok) throw new Error(`a calendar could not be read (${res.status})`);
  return (await res.json()).items ?? [];
}

// One day's events from every configured calendar. A calendar that fails is
// reported in problems rather than sinking the others.
export async function calendarDay(date: string): Promise<{ date: string; events: DayEvent[]; problems: string[] }> {
  const { min, max } = londonDayBounds(date);
  const work = (Deno.env.get("CALENDAR_WORK_ID") || "").trim();
  const personal = (Deno.env.get("CALENDAR_PERSONAL_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const problems: string[] = [];
  if (!work && !personal.length) problems.push("No calendars are set up yet (CALENDAR_WORK_ID / CALENDAR_PERSONAL_IDS).");
  const jobs = [
    ...personal.map((id) => listRaw(id, min, max).then((r) => shapeEvents(r, "personal"))),
    ...(work ? [listRaw(work, min, max).then((r) => shapeEvents(r, "work"))] : []),
  ];
  const settled = await Promise.allSettled(jobs);
  const events: DayEvent[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") events.push(...s.value);
    else problems.push((i < personal.length ? "A personal calendar: " : "The work calendar: ") + (s.reason as Error).message);
  });
  events.sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start));
  return { date, events, problems };
}

// --- Several days at once, for the Calendar page's week and month (5 Nov 2026) ---

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function calendarIds(): { work: string; personal: string[] } {
  return {
    work: (Deno.env.get("CALENDAR_WORK_ID") || "").trim(),
    personal: (Deno.env.get("CALENDAR_PERSONAL_IDS") || "").split(",").map((s) => s.trim()).filter(Boolean),
  };
}

export async function calendarRange(start: string, days: number): Promise<{ start: string; days: number; events: DayEvent[]; problems: string[] }> {
  const n = Math.max(1, Math.min(42, Math.round(days)));
  const min = londonDayBounds(start).min;
  const max = londonDayBounds(addDays(start, n - 1)).max;
  const { work, personal } = calendarIds();
  const problems: string[] = [];
  if (!work && !personal.length) problems.push("No calendars are set up yet (CALENDAR_WORK_ID / CALENDAR_PERSONAL_IDS).");
  const settled = await Promise.allSettled([
    ...personal.map((id) => listRaw(id, min, max, 250).then((r) => shapeEvents(r, "personal"))),
    ...(work ? [listRaw(work, min, max, 250).then((r) => shapeEvents(r, "work"))] : []),
  ]);
  const events: DayEvent[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") events.push(...s.value);
    else problems.push((i < personal.length ? "A personal calendar: " : "The work calendar: ") + (s.reason as Error).message);
  });
  events.sort((a, b) => a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) || Number(b.all_day) - Number(a.all_day) || a.start.localeCompare(b.start));
  return { start, days: n, events, problems };
}

// --- Adding an event (5 Nov 2026) ---
// Goes into the first personal calendar. The Google sign-in was made for
// reading only (calendar.readonly), so until Stewart re-runs google-reauth.py,
// which now asks for calendar.events too, Google refuses and this says so
// plainly (NEEDS_WRITE); the catalog then opens Google Calendar's own form,
// filled in, instead.

export const NEEDS_WRITE = "needs-calendar-write";

export interface NewEvent { title: string; date: string; all_day: boolean; start?: string; end?: string; where?: string }

// The pure part: checks, and the body Google wants.
export function eventBody(e: NewEvent): Record<string, unknown> {
  const title = (e.title || "").trim();
  if (!title) throw new Error("an event needs a title");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) throw new Error("the date must be YYYY-MM-DD");
  const body: Record<string, unknown> = { summary: title.slice(0, 300) };
  if (e.where && e.where.trim()) body.location = e.where.trim().slice(0, 300);
  if (e.all_day) {
    body.start = { date: e.date };
    body.end = { date: addDays(e.date, 1) };
    return body;
  }
  const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hm.test(e.start || "")) throw new Error("the start time must be HH:MM");
  const end = e.end && hm.test(e.end) ? e.end : null;
  if (e.end && !end) throw new Error("the end time must be HH:MM");
  let endDate = e.date, endTime = end;
  if (!endTime) {
    const [h, m] = (e.start as string).split(":").map(Number);
    const t = h * 60 + m + 60;
    endTime = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    if (t >= 24 * 60) endDate = addDays(e.date, 1);
  } else if (endTime <= (e.start as string)) {
    endDate = addDays(e.date, 1);
  }
  body.start = { dateTime: `${e.date}T${e.start}:00`, timeZone: TIMEZONE };
  body.end = { dateTime: `${endDate}T${endTime}:00`, timeZone: TIMEZONE };
  return body;
}

export async function addCalendarEvent(e: NewEvent): Promise<{ id: string; link: string | null }> {
  const body = eventBody(e);
  const target = calendarIds().personal[0];
  if (!target) throw new Error("no personal calendar is set up (CALENDAR_PERSONAL_IDS)");
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(target)}/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 403 || res.status === 401) throw new Error(NEEDS_WRITE);
  if (!res.ok) throw new Error(`Google would not add it (${res.status})`);
  const d = await res.json();
  return { id: d.id, link: d.htmlLink ?? null };
}
