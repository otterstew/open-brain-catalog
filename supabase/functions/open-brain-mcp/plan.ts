// --- The Morning plan's saved blocks (5 Nov 2026) ---
//
// The catalog works out the suggestion (which tasks, fitted into the free time
// around the calendar) and Stewart confirms it; the server only stores what he
// confirmed, one day at a time. This file checks a plan before it is stored.

export interface PlanBlockIn {
  start: string;        // "HH:MM", local time
  minutes: number;
  title: string;
  task_id?: string | null;
}

export interface PlanBlockRow {
  day: string;
  start_time: string;
  minutes: number;
  title: string;
  task_id: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// Returns the rows to store, or the first problem found, in plain words.
export function checkPlan(day: string, blocks: PlanBlockIn[]): { rows: PlanBlockRow[] } | { problem: string } {
  if (!isDay(day)) return { problem: `day must be a real date as YYYY-MM-DD, got "${day}"` };
  if (!Array.isArray(blocks)) return { problem: "blocks must be a list" };
  if (blocks.length > 40) return { problem: "a day's plan holds at most 40 blocks" };
  const rows: PlanBlockRow[] = [];
  for (const [i, b] of blocks.entries()) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(b?.start ?? "").trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return { problem: `block ${i + 1}: start must be HH:MM` };
    const minutes = Math.round(Number(b.minutes));
    if (!Number.isFinite(minutes) || minutes < 5 || minutes > 600) return { problem: `block ${i + 1}: minutes must be between 5 and 600` };
    const title = String(b.title ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
    if (!title) return { problem: `block ${i + 1}: needs a title` };
    const task = b.task_id ? String(b.task_id) : null;
    if (task && !UUID.test(task)) return { problem: `block ${i + 1}: task_id is not a task id` };
    rows.push({ day, start_time: `${m[1].padStart(2, "0")}:${m[2]}`, minutes, title, task_id: task });
  }
  rows.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { rows };
}
