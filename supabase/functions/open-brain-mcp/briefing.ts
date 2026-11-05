// --- Today's extras: stays, tides and the sun (5 Nov 2026) ---
//
// The morning briefing's pieces, moving from the Life Engine's Telegram
// message onto the catalog's Today page (Stewart, 5 Nov 2026: "stay reminders
// and meeting prep should be migrated to one brain page as should the tide
// heights/times and sunset/sunrise; then telegram life engine can probably be
// retired"). The Life Engine keeps its own copies of this code until it is
// retired, so the two can run side by side for a while.
//
// Stays come from the Wishing Stream bookings system's /briefing route with
// BOOKINGS_BRIEFING_KEY, a key that opens that route and nothing else; what
// comes back never carries a phone number or email, only whether one is on
// file. The bookings system stays a separate project (see CLAUDE.md): nothing
// about stays is stored here.
//
// Tides are Jersey Met's. Its address carries a function key, so it lives in
// the JERSEY_TIDES_URL secret, not here: this file is mirrored to a public repo.
// Sunrise and sunset are Open-Meteo's, for St Helier, no key.

export const TIMEZONE = "Europe/London";
const ST_HELIER = { lat: 49.19, lon: -2.11 };
const BOOKINGS_URL = "https://wqncpiokoaqwhpcwtawd.supabase.co/functions/v1/bookings";

export interface Tide { time: string; height_m: number; type: "high" | "low" }
export interface Sun { sunrise: string; sunset: string }

export interface StayTask {
  id: string;
  kind: string;
  label: string;
  due_on: string;
  days_until_due: number;
  gite: string;
  guest_name: string | null;
  checkin: string;
  checkout: string;
  contact: string;
  same_day_arrival: boolean;
  turnover_by: string | null;
}
export interface StayMovement { kind: "arrival" | "departure"; gite: string; guest_name: string | null }
export interface Stays { tasks: StayTask[]; movements: StayMovement[] }

export interface TodayExtras {
  date: string;
  sun: Sun | null;
  tides: Tide[];
  stays: Stays | null;
  problems: string[];
}

// --- The pure parts ---

type RawTideDay = { date?: string; tideTimes?: { time?: string; height?: string; highLowShort?: string }[] };

export function shapeTides(raw: unknown, date: string): Tide[] {
  if (!Array.isArray(raw)) throw new Error("tides came back in an unexpected shape");
  const day = (raw as RawTideDay[]).find((d) => String(d.date || "").slice(0, 10) === date);
  if (!day) return [];
  return (day.tideTimes || [])
    .filter((t) => /^\d{1,2}:\d\d$/.test(String(t.time || "")) && Number.isFinite(Number(t.height)))
    .map((t) => ({
      time: String(t.time).padStart(5, "0"),
      height_m: Number(t.height),
      type: (t.highLowShort === "HW" ? "high" : "low") as "high" | "low",
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function shapeSun(raw: unknown, date: string): Sun | null {
  const d = (raw as { daily?: { time?: string[]; sunrise?: string[]; sunset?: string[] } })?.daily;
  if (!d || !Array.isArray(d.time)) return null;
  const i = d.time.indexOf(date);
  if (i < 0) return null;
  const hhmm = (s?: string) => (s && /T\d\d:\d\d/.test(s) ? s.slice(11, 16) : null);
  const sunrise = hhmm(d.sunrise?.[i]), sunset = hhmm(d.sunset?.[i]);
  return sunrise && sunset ? { sunrise, sunset } : null;
}

// Only what Today shows, so nothing new about a guest crosses by accident if
// the bookings system adds fields later.
export function shapeStays(body: unknown): Stays {
  const b = (body || {}) as { tasks?: StayTask[]; movements?: StayMovement[] };
  const tasks = (Array.isArray(b.tasks) ? b.tasks : []).map((t) => ({
    id: String(t.id), kind: String(t.kind || ""), label: String(t.label || "Stay task"),
    due_on: String(t.due_on || ""), days_until_due: Number(t.days_until_due) || 0,
    gite: String(t.gite || ""), guest_name: t.guest_name ? String(t.guest_name) : null,
    checkin: String(t.checkin || ""), checkout: String(t.checkout || ""),
    contact: String(t.contact || ""), same_day_arrival: !!t.same_day_arrival,
    turnover_by: t.turnover_by ? String(t.turnover_by) : null,
  }));
  const movements = (Array.isArray(b.movements) ? b.movements : [])
    .filter((m) => m && (m.kind === "arrival" || m.kind === "departure"))
    .map((m) => ({ kind: m.kind, gite: String(m.gite || ""), guest_name: m.guest_name ? String(m.guest_name) : null }));
  return { tasks, movements };
}

// --- The network parts ---

async function bookings(path: string, init: RequestInit = {}): Promise<Response> {
  const key = Deno.env.get("BOOKINGS_BRIEFING_KEY") || "";
  if (!key) throw new Error("the bookings key is not set");
  return await fetch(`${BOOKINGS_URL}${path}`, {
    ...init,
    headers: { "x-bookings-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
}

export async function fetchStays(days: number): Promise<Stays> {
  const res = await bookings(`/briefing?days=${Math.max(0, Math.min(60, Math.round(days)))}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`the bookings system said ${res.status}${body.error ? ": " + body.error : ""}`);
  return shapeStays(body);
}

// Returns null when done, or why not.
export async function tickStayTask(id: string): Promise<string | null> {
  try {
    const res = await bookings(`/briefing/tasks/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ status: "done" }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body.reason ?? body.error ?? `the bookings system said ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

async function fetchTides(date: string): Promise<Tide[]> {
  const url = Deno.env.get("JERSEY_TIDES_URL") || "";
  if (!url) throw new Error("the tides address is not set");
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Jersey Met said ${res.status}`);
  return shapeTides(await res.json(), date);
}

async function fetchSun(date: string): Promise<Sun | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${ST_HELIER.lat}&longitude=${ST_HELIER.lon}` +
    `&daily=sunrise,sunset&timezone=${encodeURIComponent(TIMEZONE)}&start_date=${date}&end_date=${date}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo said ${res.status}`);
  return shapeSun(await res.json(), date);
}

// Each part on its own: one that fails is named in problems, the rest still show.
export async function todayExtras(date: string, stayDays: number): Promise<TodayExtras> {
  const problems: string[] = [];
  const settle = async <T>(what: string, fallback: T, fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (err) { problems.push(`${what}: ${(err as Error).message}`); return fallback; }
  };
  const [sun, tides, stays] = await Promise.all([
    settle<Sun | null>("sunrise and sunset", null, () => fetchSun(date)),
    settle<Tide[]>("tides", [], () => fetchTides(date)),
    settle<Stays | null>("stays", null, () => fetchStays(stayDays)),
  ]);
  return { date, sun, tides, stays, problems };
}
