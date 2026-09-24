/**
 * Number entry rules shared by <NumberPad> and <NumberField>. Pure string in,
 * string out, so the rules are unit-tested without a DOM.
 *
 * The value is kept as the digits the tradie typed ("12", "12.", "12.5"),
 * not a number, so a trailing point or zero survives while they type.
 */

import { formatCurrency } from "@/lib/quote-defaults";

export type PadDigit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type PadKey = PadDigit | "." | "backspace" | "clear";

export interface NumberRules {
  /** Digits allowed after the point. 0 = whole numbers only. */
  decimals: number;
  /** Digits allowed before the point (7 = up to 9,999,999). */
  maxIntegerDigits: number;
}

export const DEFAULT_NUMBER_RULES: NumberRules = { decimals: 2, maxIntegerDigits: 7 };

function rulesWith(partial?: Partial<NumberRules>): NumberRules {
  return { ...DEFAULT_NUMBER_RULES, ...partial };
}

const DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

/** Apply one key press to the typed value. Invalid presses leave it unchanged. */
export function applyPadKey(value: string, key: PadKey, partialRules?: Partial<NumberRules>): string {
  const rules = rulesWith(partialRules);
  if (key === "clear") return "";
  if (key === "backspace") return value.slice(0, -1);

  const point = value.indexOf(".");
  if (key === ".") {
    if (rules.decimals <= 0 || point !== -1) return value;
    return value === "" ? "0." : `${value}.`;
  }

  if (!DIGITS.has(key)) return value;
  if (point !== -1) {
    const fraction = value.length - point - 1;
    return fraction < rules.decimals ? value + key : value;
  }
  // No leading zeros: "0" then "5" is "5"; "0" then "0" stays "0".
  if (value === "0") return key;
  return value.length < rules.maxIntegerDigits ? value + key : value;
}

/** Map a physical keyboard key to a pad key (desktop and Bluetooth keyboards). */
export function padKeyFromKeyboard(key: string): PadKey | null {
  if (DIGITS.has(key)) return key as PadDigit;
  if (key === "." || key === ",") return ".";
  if (key === "Backspace") return "backspace";
  if (key === "Delete") return "clear";
  return null;
}

/** The typed value as a number, or null when nothing (or only ".") is typed. */
export function padValueToNumber(value: string): number | null {
  if (!/\d/.test(value)) return null;
  const n = Number(value.endsWith(".") ? value.slice(0, -1) : value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Clean typed or pasted text for a decimal field: "$1,240.50" → "1240.50",
 * "12,5" (decimal comma) → "12.5", "007" → "7", ".5" → "0.5". Extra fraction
 * and integer digits are dropped rather than rounded.
 */
export function sanitizeDecimalInput(raw: string, partialRules?: Partial<NumberRules>): string {
  const rules = rulesWith(partialRules);
  let s = raw.replace(/[^\d.,]/g, "");
  if (s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const commas = s.split(",").length - 1;
    const after = s.length - s.lastIndexOf(",") - 1;
    // One comma followed by 1–decimals digits is a decimal comma; otherwise
    // commas group thousands ("1,240").
    s = commas === 1 && after > 0 && after <= rules.decimals ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const point = s.indexOf(".");
  let whole = point === -1 ? s : s.slice(0, point);
  let fraction = point === -1 ? null : s.slice(point + 1).replace(/\./g, "");

  whole = whole.replace(/^0+(?=\d)/, "").slice(0, rules.maxIntegerDigits);
  if (rules.decimals <= 0) fraction = null;
  if (fraction === null) return whole;
  return `${whole === "" ? "0" : whole}.${fraction.slice(0, rules.decimals)}`;
}

/** Currency symbol as the app prints it ("$" for NZD, "£" for GBP). */
export function currencySymbol(currency: string): string {
  return formatCurrency(0, currency).replace(/[\d.,\s -]/g, "") || currency;
}
