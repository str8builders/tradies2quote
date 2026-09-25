/**
 * Timesheet hours, worked out from a start, a finish and a break (never
 * typed), exactly as the database does it (public.time_entry_hours in
 * 20260927_time_entries.sql): round((finish - start - break) in hours, 2).
 * Pure.
 */

import { round2 } from "@/lib/quote-defaults";

/** The break choices on the entry sheet (minutes). */
export const BREAK_CHOICES = [0, 15, 30, 45, 60] as const;
export const MAX_BREAK_MINUTES = 600;
export const NOTE_MAX = 300;

/** "07:00" or "7:00" or "07:00:00" → minutes after midnight; null if not a time. */
export function parseTime(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec((value ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** Minutes after midnight → "07:00" (what <input type="time"> and Postgres use). */
export function timeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "07:00" → "7:00am", "15:30" → "3:30pm" (how NZ tradies write it). */
export function formatTime(value: string): string {
  const minutes = parseTime(value);
  if (minutes === null) return value;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${h < 12 ? "am" : "pm"}`;
}

export type WorkedResult = { ok: true; minutes: number; hours: number } | { ok: false; error: string };

/**
 * Time worked for a start, finish and break. Plain-words errors for the
 * sheet; the same rules as the table's checks (finish after start, break
 * 0–600 minutes and shorter than the day).
 */
export function workedTime(start: string, finish: string, breakMinutes: number): WorkedResult {
  const from = parseTime(start);
  const to = parseTime(finish);
  if (from === null) return { ok: false, error: "Put in a start time." };
  if (to === null) return { ok: false, error: "Put in a finish time." };
  if (to <= from) return { ok: false, error: "Finish has to be after start (same day)." };
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > MAX_BREAK_MINUTES) {
    return { ok: false, error: "The break has to be between 0 and 600 minutes." };
  }
  const minutes = to - from - breakMinutes;
  if (minutes <= 0) return { ok: false, error: "The break is longer than the time worked." };
  return { ok: true, minutes, hours: round2(minutes / 60) };
}

/** 8 → "8 h", 7.5 → "7.5 h", 7.75 → "7.75 h". */
export function formatHours(hours: number): string {
  const rounded = round2(hours);
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)} h`;
}

/** Add up hours, rounding once per entry (as the database does). */
export function sumHours(values: readonly number[]): number {
  return round2(values.reduce((total, h) => total + round2(h), 0));
}
