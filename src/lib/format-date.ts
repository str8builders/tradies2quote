/**
 * Engine-independent date/time labels.
 *
 * `toLocaleDateString` / `Intl.DateTimeFormat` output differs between the
 * server's Node ICU and a phone's WebKit/Blink ICU ("Sunday, 13 September"
 * vs "Sunday 13 September", "Sept" vs "Sep", "pm" vs "PM"). Any client
 * component that renders such text during hydration then trips React #418
 * (the dashboard calendar and public quote page did). These helpers only use
 * Intl for *numeric* time-zone parts, which every engine agrees on, and spell
 * the words themselves using the en-NZ CLDR names.
 */

export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;
/** en-NZ abbreviations (CLDR): note "Sept". */
export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sept", "Oct", "Nov", "Dec"] as const;
export const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const NZ_TIME_ZONE = "Pacific/Auckland";

export type DateParts = { year: number; month: number; day: number; weekday: number; hour: number; minute: number };

const partFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partFormatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23",
      year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "numeric",
    });
    partFormatters.set(timeZone, f);
  }
  return f;
}
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar parts of an instant in a time zone (month is 1-based). */
export function datePartsInZone(date: Date, timeZone = NZ_TIME_ZONE): DateParts | null {
  if (Number.isNaN(date.getTime())) return null;
  const out: Partial<DateParts> = {};
  for (const p of partsFormatter(timeZone).formatToParts(date)) {
    if (p.type === "year") out.year = Number(p.value);
    else if (p.type === "month") out.month = Number(p.value);
    else if (p.type === "day") out.day = Number(p.value);
    else if (p.type === "hour") out.hour = Number(p.value) % 24;
    else if (p.type === "minute") out.minute = Number(p.value);
    else if (p.type === "weekday") out.weekday = WEEKDAY_INDEX[p.value] ?? 0;
  }
  return out as DateParts;
}

/** "13 Sept" — the NZ calendar day of an ISO instant. */
export function formatNZShortDate(iso: string): string {
  const parts = datePartsInZone(new Date(iso));
  if (!parts) return "—";
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
}

/** "9:05 pm" — NZ wall-clock time of an ISO instant. */
export function formatNZTime(iso: string): string {
  const parts = datePartsInZone(new Date(iso));
  if (!parts) return "—";
  const h12 = parts.hour % 12 || 12;
  return `${h12}:${String(parts.minute).padStart(2, "0")} ${parts.hour < 12 ? "am" : "pm"}`;
}

/** "13/09/2026" — NZ numeric date (what en-NZ toLocaleDateString gives). */
export function formatNZNumericDate(iso: string): string {
  const parts = datePartsInZone(new Date(iso));
  if (!parts) return "—";
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

/** Parse a plain `YYYY-MM-DD` key as a calendar date (no time zone shift). */
export function parseDateKey(key: string): { year: number; month: number; day: number; weekday: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day, weekday: d.getUTCDay() };
}

/** "September 2026" (month is 0-based like Date). */
export function formatMonthYear(year: number, monthIndex: number): string {
  return `${MONTHS_LONG[((monthIndex % 12) + 12) % 12]} ${year}`;
}

/** "Sunday, 13 September" for a `YYYY-MM-DD` key. */
export function formatLongDayDate(key: string): string {
  const p = parseDateKey(key);
  if (!p) return key;
  return `${WEEKDAYS_LONG[p.weekday]}, ${p.day} ${MONTHS_LONG[p.month - 1]}`;
}

/** "Sun, 13 Sept" for a `YYYY-MM-DD` key. */
export function formatShortDayDate(key: string): string {
  const p = parseDateKey(key);
  if (!p) return key;
  return `${WEEKDAYS_SHORT[p.weekday]}, ${p.day} ${MONTHS_SHORT[p.month - 1]}`;
}

/** "Sun" for a `YYYY-MM-DD` key. */
export function formatWeekdayShort(key: string): string {
  const p = parseDateKey(key);
  return p ? WEEKDAYS_SHORT[p.weekday] : key;
}
