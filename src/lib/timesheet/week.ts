/**
 * Timesheet weeks: Monday to Sunday, as `YYYY-MM-DD` day keys in the
 * business's own time zone (the caller works out today's key). Pure.
 */

import { MONTHS_SHORT, WEEKDAYS_SHORT } from "@/lib/format-date";

const KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day key, or null. */
export function parseDayKey(value: string | null | undefined): string | null {
  const match = KEY.exec((value ?? "").trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return match[0];
}

function toDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The day `n` days after (or before) a day key. */
export function addDays(key: string, n: number): string {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + n);
  return toKey(date);
}

/** Monday of the week a day falls in. */
export function weekStart(key: string): string {
  const weekday = toDate(key).getUTCDay(); // 0 Sunday
  return addDays(key, weekday === 0 ? -6 : 1 - weekday);
}

/** The seven day keys, Monday first. */
export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** "Mon 22 Sept". */
export function dayLabel(key: string): string {
  const date = toDate(key);
  return `${WEEKDAYS_SHORT[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
}

/** "22 to 28 Sept", or "29 Sept to 5 Oct" across a month. */
export function weekLabel(start: string): string {
  const a = toDate(start);
  const b = toDate(addDays(start, 6));
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${a.getUTCDate()} to ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS_SHORT[a.getUTCMonth()]} to ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]}`;
}

/** The week to show: ?week= when it's a real day, else this week. Always a Monday. */
export function resolveWeek(param: string | null | undefined, todayKey: string): string {
  return weekStart(parseDayKey(param) ?? todayKey);
}
