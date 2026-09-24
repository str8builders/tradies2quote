/**
 * Dates and plain-words helpers for the new-look Home and Jobs screens.
 *
 * Pure and engine-independent: word forms come from src/lib/format-date.ts
 * (en-NZ names, spelled by hand), and Intl is only used for numeric
 * time-zone parts, so the server and a phone always agree.
 */

import { MONTHS_SHORT, WEEKDAYS_SHORT, datePartsInZone, parseDateKey } from "@/lib/format-date";
import { taxCountryFor } from "@/lib/quote-defaults";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where the business is, as a time zone (one per country; NZ when unknown). */
const COUNTRY_ZONE = {
  NZ: "Pacific/Auckland",
  AU: "Australia/Sydney",
  UK: "Europe/London",
  US: "America/Chicago",
  CA: "America/Toronto",
} as const;

export function businessTimeZone(country?: string | null, currency?: string | null): string {
  return COUNTRY_ZONE[taxCountryFor(country, currency)];
}

/** Whole days from an instant to `now` (never negative). Null when unknown. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "2026-09-25": the calendar day of an instant in a time zone. */
export function dayKeyInZone(date: Date, timeZone: string): string | null {
  const p = datePartsInZone(date, timeZone);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : null;
}

/**
 * Calendar days from one `YYYY-MM-DD` key to a later one (negative when the
 * second is earlier). Null when either key is not a real date.
 */
export function daysBetweenKeys(from: string | null, to: string | null): number | null {
  const a = parseDateKey(from ?? "");
  const b = parseDateKey(to ?? "");
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS,
  );
}

/** "2026-09": the month of an instant in a time zone. */
export function monthKeyInZone(date: Date, timeZone: string): string | null {
  const p = datePartsInZone(date, timeZone);
  return p ? `${p.year}-${pad(p.month)}` : null;
}

/**
 * "Tue 30 Sept" for a job date. Takes a `YYYY-MM-DD` key or a timestamp and
 * reads its first ten characters, as the dashboard calendar does.
 */
export function shortDay(value: string | null | undefined): string | null {
  const p = parseDateKey((value ?? "").slice(0, 10));
  return p ? `${WEEKDAYS_SHORT[p.weekday]} ${p.day} ${MONTHS_SHORT[p.month - 1]}` : null;
}

export type Greeting = "Good morning" | "Good afternoon" | "Good evening";

/** Morning from 5 am, afternoon from noon, evening from 5 pm, in the business's zone. */
export function greetingFor(now: Date, timeZone: string): Greeting {
  const hour = datePartsInZone(now, timeZone)?.hour ?? 9;
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "1 day", "3 days". */
export function countOf(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "today", "yesterday", "4 days ago". */
export function agoText(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
