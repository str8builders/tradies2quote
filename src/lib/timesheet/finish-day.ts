/**
 * Finishing a shift that started on an earlier day (you forgot to tap
 * Finish, or the phone was off). An entry can't cross midnight, so the
 * finish is picked on the day the shift started, in the business's time
 * zone. Pure: every "now" is passed in.
 */

function partsOf(at: number, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(at));
  const out: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-09-26": the day a moment falls on in a time zone. */
export function dayIn(at: number, timeZone: string): string {
  const p = partsOf(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "11:19": the wall-clock time of a moment in a time zone (24-hour). */
export function timeIn(at: number, timeZone: string): string {
  const p = partsOf(at, timeZone);
  return `${pad(p.hour % 24)}:${pad(p.minute)}`;
}

/** Started before today, in the business's time zone. */
export function startedEarlierDay(startedAt: string, now: number, timeZone: string): boolean {
  const start = Date.parse(startedAt);
  return Number.isFinite(start) && dayIn(start, timeZone) < dayIn(now, timeZone);
}

/** How far a time zone is ahead of UTC at a moment (ms). */
function offsetAt(at: number, timeZone: string): number {
  const whole = Math.floor(at / 1000) * 1000;
  const p = partsOf(whole, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - whole;
}

/** The moment a wall-clock time on a day happens in a time zone, or null. */
export function zonedMoment(day: string, hhmm: string, timeZone: string): number | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const t = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!d || !t || Number(t[1]) > 23 || Number(t[2]) > 59) return null;
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  // Twice, so a daylight-saving change between the guess and the answer is taken into account.
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

/**
 * When the shift finished, from a time picked on the day it started: more
 * than a minute after the start, still that day, and not in the future.
 * Null when the time can't be right.
 */
export function finishOnStartDay(startedAt: string, hhmm: string, now: number, timeZone: string): number | null {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return null;
  const day = dayIn(start, timeZone);
  const at = zonedMoment(day, hhmm, timeZone);
  if (at === null || at <= start + 60_000 || at > now || dayIn(at, timeZone) !== day) return null;
  return at;
}

/** Where the finish time starts: 5pm, or an hour after starting if that's later, never past 11:59pm. */
export function defaultFinish(startedAt: string, timeZone: string): string {
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "17:00";
  const [h, m] = timeIn(start, timeZone).split(":").map(Number);
  const minutes = Math.min(Math.max(17 * 60, h * 60 + m + 60), 23 * 60 + 59);
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "Sat 26 Sept": the day a shift started, in the business's time zone. */
export function shiftDay(startedAt: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short", timeZone }).formatToParts(
      new Date(startedAt),
    );
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("weekday")} ${get("day")} ${get("month")}`;
  } catch {
    return "that day";
  }
}
