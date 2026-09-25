// ─────────────────────────────────────────────────────────────────────────
// Labour sanity check (audit item 3).
//
// The model's labour quantity was only clamped at 0 and the send gate's
// quantity confirmation covers materials only, so "40 hours" on a job the
// tradie called "a 2 day job" went out unquestioned. These rules raise a
// "check this" warning the tradie must acknowledge before sending (the same
// path as a $0 line). They never change a number.
//
//   - More than 12 hours a day (per person) against the duration the tradie
//     stated ("2 day job", "about a week", "6 hours", "2 guys for 3 days").
//   - More labour days than the days stated.
//   - A single labour line past a working year (2,000 hours / 250 days) —
//     a slip whatever the transcript says.
//
// Money rates are removed first, so "$600 a day" is a price, not a duration.
// Pure and deterministic.
// ─────────────────────────────────────────────────────────────────────────

import type { QuoteLineItem } from "./quote-types";
import { normaliseUnit } from "./units";

/** A working day can't plausibly run past this many hours per person. */
export const MAX_HOURS_PER_DAY = 12;
/** A standard working day, for comparing day lines with stated hours. */
const HOURS_PER_WORKING_DAY = 8;
const WORKING_DAYS_PER_WEEK = 5;
/** Past these, one labour line is a slip (a full working year for one person). */
export const ABSURD_LINE_HOURS = 2000;
export const ABSURD_LINE_DAYS = 250;

export type StatedDuration = {
  /** Working days stated (weeks × 5). */
  days: number;
  /** Hours stated. */
  hours: number;
  /** People on the job (1 unless the tradie said otherwise). */
  crew: number;
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function quantityOf(token: string): number {
  const t = token.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(?:a )?couple(?: of)?$/.test(t)) return 2;
  if (/^half an?$/.test(t)) return 0.5;
  if (t in WORD_NUMBERS) return WORD_NUMBERS[t];
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

/** "$600 a day", "85 per hour", "$75/hr", "90ph" — prices, not durations. */
const RATE_RE =
  /(?:[$£€]\s?)?\b\d[\d,]*(?:\.\d+)?\s*k?\s*(?:\/\s*|per\s+|an?\s+|p\/?)(?:hour|hr|h|day|week)s?\b/gi;

const QTY = String.raw`(\d+(?:\.\d+)?|a\s+couple(?:\s+of)?|couple(?:\s+of)?|half\s+an?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const DURATION_RE = new RegExp(
  String.raw`\b${QTY}\s*(?:-\s*)?(days?|weeks?|wks?|hours?|hrs?)\b`,
  "gi",
);

const CREW_NUM = String.raw`(\d+|two|three|four|five|six|seven|eight)`;
const CREW_PATTERNS: Array<{ re: RegExp; extra: number }> = [
  // "2 guys", "three builders", "4 of us"
  {
    re: new RegExp(
      String.raw`\b${CREW_NUM}\s+(?:of us|guys|men|blokes|builders|chippies|carpenters|workers|people|tradies|labourers|lads|hands)\b`,
      "gi",
    ),
    extra: 0,
  },
  // "crew of 3", "a 2-man crew"
  { re: new RegExp(String.raw`\bcrew of ${CREW_NUM}\b`, "gi"), extra: 0 },
  { re: new RegExp(String.raw`\b${CREW_NUM}[-\s]man\b`, "gi"), extra: 0 },
  // "me and 2 guys" = 3
  {
    re: new RegExp(String.raw`\bme and ${CREW_NUM}\s+(?:others|guys|lads|blokes|workers|builders)\b`, "gi"),
    extra: 1,
  },
];
const ME_AND_ONE_RE =
  /\bme and (?:my|an?|the|one)\s+(?:apprentice|labourer|offsider|mate|son|daughter|partner|builder|worker|hammerhand|chippy)\b/i;

/**
 * The duration and crew the tradie stated, or null when no duration was
 * stated. Every duration mentioned is added up (a generous cap — an
 * incidental "2 hours" only ever makes the check more lenient).
 */
export function statedDuration(text: string): StatedDuration | null {
  let t = (text ?? "").toLowerCase().replace(RATE_RE, " ");
  t = t
    .replace(/\b(?:a\s+)?day and a half\b/g, "1.5 days")
    .replace(/\b(?:an\s+)?hour and a half\b/g, "1.5 hours");
  let days = 0;
  let hours = 0;
  for (const m of t.matchAll(DURATION_RE)) {
    const q = quantityOf(m[1] ?? "");
    if (!(q > 0)) continue;
    const unit = (m[2] ?? "").toLowerCase();
    if (unit.startsWith("day")) days += q;
    else if (unit.startsWith("w")) days += q * WORKING_DAYS_PER_WEEK;
    else hours += q;
  }
  if (days === 0 && hours === 0) return null;
  let crew = ME_AND_ONE_RE.test(t) ? 2 : 1;
  for (const { re, extra } of CREW_PATTERNS) {
    for (const m of t.matchAll(re)) {
      const n = quantityOf(m[1] ?? "") + extra;
      if (n > crew && n <= 50) crew = n;
    }
  }
  return { days, hours, crew };
}

/** Hours or days for a labour line; a blank unit is hours (the prompt's default). */
function labourUnit(unit: string | null | undefined): "hour" | "day" | null {
  const u = normaliseUnit(unit);
  if (!u) return (unit ?? "").trim() ? null : "hour";
  if (u.dimension === "hour") return "hour";
  if (u.dimension === "day") return "day";
  return null;
}

function show(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function plural(n: number, word: string): string {
  return `${show(n)} ${word}${n === 1 ? "" : "s"}`;
}

function describeStated(s: StatedDuration): string {
  const parts: string[] = [];
  if (s.days > 0) parts.push(plural(s.days, "day"));
  if (s.hours > 0) parts.push(plural(s.hours, "hour"));
  return `${parts.join(" and ")}${s.crew > 1 ? ` for ${s.crew} people` : ""}`;
}

/**
 * Plain "check this" warnings for labour lines that can't be right, judged
 * against the job description the tradie gave (voice transcript / typed
 * text). Empty when nothing looks wrong. Never changes a line.
 */
export function labourPlausibilityWarnings(
  items: ReadonlyArray<Pick<QuoteLineItem, "type" | "description" | "quantity" | "unit">>,
  description?: string | null,
): string[] {
  const out: string[] = [];
  let hours = 0;
  let days = 0;
  for (const it of items) {
    if (it.type !== "labour") continue;
    const q = Number(it.quantity) || 0;
    if (q <= 0) continue;
    const unit = labourUnit(it.unit);
    if (unit === "hour") {
      hours += q;
      if (q > ABSURD_LINE_HOURS) {
        out.push(`"${it.description}" has ${show(q)} hours of labour — that can't be right for one line. Check the quantity.`);
      }
    } else if (unit === "day") {
      days += q;
      if (q > ABSURD_LINE_DAYS) {
        out.push(`"${it.description}" has ${show(q)} days of labour — that can't be right for one line. Check the quantity.`);
      }
    }
  }
  // An absurd line says it all; comparing it with the stated duration adds nothing.
  if (out.length > 0 || (hours === 0 && days === 0)) return out;

  const stated = statedDuration(description ?? "");
  if (!stated) return out;
  const said = describeStated(stated);
  const perPerson = stated.crew > 1 ? " each" : "";

  if (stated.days > 0) {
    const capHours = (stated.days * MAX_HOURS_PER_DAY + stated.hours) * stated.crew;
    const capDays = (stated.days + stated.hours / HOURS_PER_WORKING_DAY) * stated.crew;
    if (days === 0 && hours > capHours) {
      out.push(
        `Labour adds up to ${plural(hours, "hour")}, but the job was described as ${said} — that's more than ${MAX_HOURS_PER_DAY} hours a day${perPerson}. Check the labour hours.`,
      );
    } else if (hours === 0 && days > capDays) {
      out.push(`Labour adds up to ${plural(days, "day")}, but the job was described as ${said}. Check the labour days.`);
    } else if (hours > 0 && days > 0 && hours + days * HOURS_PER_WORKING_DAY > capHours) {
      out.push(
        `Labour adds up to ${plural(days, "day")} and ${plural(hours, "hour")}, but the job was described as ${said} — that's more than ${MAX_HOURS_PER_DAY} hours a day${perPerson}. Check the labour.`,
      );
    }
  } else {
    // Only hours were stated: the labour can't exceed them (per person).
    const total = hours + days * HOURS_PER_WORKING_DAY;
    if (total > stated.hours * stated.crew) {
      out.push(`Labour adds up to ${plural(total, "hour")}, but the job was described as ${said}. Check the labour hours.`);
    }
  }
  return out;
}
