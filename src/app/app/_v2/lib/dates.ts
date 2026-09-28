/**
 * Dates and plain-words helpers for the new-look Home and Jobs screens.
 *
 * Pure and engine-independent: word forms come from src/lib/format-date.ts
 * (en-NZ names, spelled by hand), and Intl is only used for numeric
 * time-zone parts (and to check a zone name exists), so the server and a
 * phone always agree.
 */

import { MONTHS_SHORT, WEEKDAYS_SHORT, datePartsInZone, parseDateKey } from "@/lib/format-date";
import { taxCountryFor } from "@/lib/quote-defaults";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Each country's zone when the business's own isn't known yet (NZ when the country is unknown). */
const COUNTRY_ZONE = {
  NZ: "Pacific/Auckland",
  AU: "Australia/Sydney",
  UK: "Europe/London",
  US: "America/Chicago",
  CA: "America/Toronto",
} as const;

type BusinessCountry = keyof typeof COUNTRY_ZONE;

/** US zones outside America/* (Hawaii and the territories). */
const US_PACIFIC_ZONES = new Set(["Pacific/Honolulu", "Pacific/Guam", "Pacific/Saipan", "Pacific/Pago_Pago"]);

/** "Australia/Perth", "America/Argentina/Buenos_Aires": the shape of an IANA name (as profiles.time_zone's check). */
const ZONE_NAME = /^[A-Za-z]+(?:\/[A-Za-z0-9_+-]+){1,2}$/;

/** A time zone name this engine knows (never an offset like "+13:00", never bare "UTC"). */
export function isIanaZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone.length < 3 || zone.length > 64 || !ZONE_NAME.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A zone a business in that country can be in (a holiday abroad isn't). */
function zoneInCountry(zone: string, country: BusinessCountry): boolean {
  switch (country) {
    case "NZ":
      return zone === "Pacific/Auckland" || zone === "Pacific/Chatham";
    case "AU":
      return zone.startsWith("Australia/");
    case "UK":
      return zone === "Europe/London";
    case "US":
      return zone.startsWith("America/") || US_PACIFIC_ZONES.has(zone);
    case "CA":
      return zone.startsWith("America/");
  }
}

/**
 * The business's own zone from a phone or browser (Intl's
 * resolvedOptions().timeZone), or null when it's no use: not a real zone,
 * or not in the business's country.
 */
export function businessZoneFrom(
  zone: string | null | undefined,
  country?: string | null,
  currency?: string | null,
): string | null {
  return isIanaZone(zone) && zoneInCountry(zone, taxCountryFor(country, currency)) ? zone : null;
}

/**
 * Where the business is, as a time zone: its own saved zone
 * (profiles.time_zone, from the phone) when that's a real zone in its
 * country, else the country's (NZ when unknown).
 */
export function businessTimeZone(country?: string | null, currency?: string | null, storedZone?: string | null): string {
  return businessZoneFrom(storedZone, country, currency) ?? COUNTRY_ZONE[taxCountryFor(country, currency)];
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
