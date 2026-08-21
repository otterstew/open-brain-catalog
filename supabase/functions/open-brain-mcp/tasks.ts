// --- Tasks ---
//
// Tasks live in their own table, not in thoughts.metadata, because they are
// queried by state and date rather than by meaning. None of the task tools
// touch OpenRouter: capturing a task must be one insert and nothing else, or
// the two-second pause turns the app into somewhere tasks go to be forgotten.

// A single literal rather than a concatenation: supabase-js reads the column
// list at the type level, and it can only do that if the string stays literal.
export const TASK_COLUMNS =
  "id, title, notes, status, project, due_date, defer_until, recur, recur_from, parent_id, thought_id, source, created_at, updated_at, completed_at" as const;

export const TASK_STATUSES = ["inbox", "next", "waiting", "done", "dropped"] as const;
export const OPEN_STATUSES = ["inbox", "next", "waiting"];

export interface TaskRecord {
  id: string;
  title: string;
  notes: string | null;
  status: string;
  project: string | null;
  due_date: string | null;
  defer_until: string | null;
  recur: string | null;
  recur_from: string;
  parent_id: string | null;
  thought_id: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// Due dates are calendar days, never instants, so every piece of arithmetic
// below is done in UTC. Local time would let a task due "tomorrow" become due
// "today" purely because the server sits in a different timezone from the
// person who wrote it down.
export function parseISODate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || "").trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  // Rejects 31 February, which Date would otherwise roll forward into March.
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return probe;
}

export function formatISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export type RecurSpec =
  | { kind: "interval"; unit: "day" | "week" | "month" | "year"; n: number }
  | { kind: "weekday"; weekday: number }  // 0 = Sunday
  | { kind: "weekdays" };                 // any Monday to Friday

export const WEEKDAY_NAMES = [
  "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
];

export const NAMED_RECURRENCES: Record<string, RecurSpec> = {
  "daily": { kind: "interval", unit: "day", n: 1 },
  "every day": { kind: "interval", unit: "day", n: 1 },
  "weekly": { kind: "interval", unit: "week", n: 1 },
  "every week": { kind: "interval", unit: "week", n: 1 },
  "fortnightly": { kind: "interval", unit: "week", n: 2 },
  "biweekly": { kind: "interval", unit: "week", n: 2 },
  "every other week": { kind: "interval", unit: "week", n: 2 },
  "monthly": { kind: "interval", unit: "month", n: 1 },
  "every month": { kind: "interval", unit: "month", n: 1 },
  "quarterly": { kind: "interval", unit: "month", n: 3 },
  "yearly": { kind: "interval", unit: "year", n: 1 },
  "annually": { kind: "interval", unit: "year", n: 1 },
  "every year": { kind: "interval", unit: "year", n: 1 },
  "weekdays": { kind: "weekdays" },
  "every weekday": { kind: "weekdays" },
};

export const RECUR_HELP =
  "'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly', " +
  "'weekdays', 'every 3 days', 'every 2 weeks', 'every 6 months', or 'every tuesday'";

// Recurrence is a phrase rather than an RRULE, so this only has to understand
// the handful of shapes people actually type. Anything else returns null and
// the caller refuses the task outright — a repeat rule that is silently
// ignored is worse than one that is rejected, because you find out months
// later when the thing never came back.
export function parseRecur(phrase: string): RecurSpec | null {
  const s = (phrase || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  if (NAMED_RECURRENCES[s]) return NAMED_RECURRENCES[s];

  let m: RegExpExecArray | null;
  if ((m = /^every (\d+) (day|week|month|year)s?$/.exec(s))) {
    const n = +m[1];
    if (n < 1 || n > 365) return null;
    return { kind: "interval", unit: m[2] as "day" | "week" | "month" | "year", n };
  }
  if ((m = /^every ([a-z]+)$/.exec(s))) {
    const i = WEEKDAY_NAMES.indexOf(m[1]);
    if (i >= 0) return { kind: "weekday", weekday: i };
  }
  return null;
}

// One month after 31 January is 28 February, not 3 March. Clamping to the end
// of the shorter month is what every calendar app does and what people expect
// of a monthly task first created on the 31st.
export function addMonthsUTC(d: Date, months: number): Date {
  const day = d.getUTCDate();
  const probe = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(probe.getUTCFullYear(), probe.getUTCMonth() + 1, 0),
  ).getUTCDate();
  probe.setUTCDate(Math.min(day, lastDay));
  return probe;
}

export function advanceOnce(d: Date, spec: RecurSpec): Date {
  const next = new Date(d.getTime());
  if (spec.kind === "interval") {
    if (spec.unit === "day") next.setUTCDate(next.getUTCDate() + spec.n);
    else if (spec.unit === "week") next.setUTCDate(next.getUTCDate() + 7 * spec.n);
    else if (spec.unit === "month") return addMonthsUTC(d, spec.n);
    else return addMonthsUTC(d, 12 * spec.n);
    return next;
  }
  if (spec.kind === "weekday") {
    // Strictly after d: completing a Tuesday task on a Tuesday means next
    // Tuesday, not today.
    let delta = (spec.weekday - d.getUTCDay() + 7) % 7;
    if (delta === 0) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }
  do {
    next.setUTCDate(next.getUTCDate() + 1);
  } while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  return next;
}

// The next instance has to land in the future. A weekly task three weeks
// overdue should come back next week, not spawn another copy that is already
// two weeks late — so from a due date we keep stepping until today is cleared.
export function nextRecurrence(spec: RecurSpec, base: Date, today: Date): Date {
  let next = advanceOnce(base, spec);
  let guard = 0;
  while (next.getTime() <= today.getTime() && guard++ < 1000) {
    next = advanceOnce(next, spec);
  }
  return next;
}

// One task per line, in the shape you would want read out to you: what state
// it is in, what it is called, when it is due and whether that has already
// passed. The id trails so the line stays readable but a follow-up tool call
// still has something to quote.
export function formatTask(t: TaskRecord, i: number, today: string): string {
  const bits: string[] = [];
  if (t.due_date) {
    bits.push(t.due_date < today ? `overdue ${t.due_date}` : `due ${t.due_date}`);
  }
  if (t.defer_until && t.defer_until > today) bits.push(`hidden until ${t.defer_until}`);
  if (t.project) bits.push(t.project);
  if (t.recur) bits.push(`repeats ${t.recur}`);
  const tail = bits.length ? ` — ${bits.join(", ")}` : "";
  const notes = t.notes ? `\n   ${t.notes.replace(/\s+/g, " ").trim().slice(0, 160)}` : "";
  return `${i + 1}. [${t.status}] ${t.title}${tail}${notes}\n   [id: ${t.id}]`;
}
