/**
 * Pure layout and timing helpers for the QuoteVideo composition. Text is
 * sized from its length (no DOM measuring), so every frame is a pure function
 * of the props and the frame number.
 */
import { Easing, interpolate } from "remotion";
import { formatCurrency } from "../../lib/quote-defaults";
import { QUOTE_VIDEO_TIMELINE } from "../../lib/quote-video/constants";

type FitOptions = {
  /** Largest and smallest font size in px. */
  max: number;
  min: number;
  /** Line width in px. */
  width: number;
  maxLines: number;
  /** Average glyph advance in em (Archivo Black capitals ≈ 0.8). */
  em?: number;
};

/** Lines `text` needs at `size` px with greedy word wrapping. */
export function estimateLines(text: string, size: number, width: number, em = 0.8): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const space = 0.3 * size;
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = Array.from(word).length * em * size;
    if (used === 0) used = w;
    else if (used + space + w <= width) used += space + w;
    else {
      lines += 1;
      used = w;
    }
    // A word wider than the line breaks across lines (overflow-wrap: anywhere).
    if (w > width) lines += Math.ceil(w / width) - 1;
  }
  return lines;
}

/** Largest size (2 px steps) at which every word fits on a line and the text fits in `maxLines`. */
export function fitDisplaySize(text: string, { max, min, width, maxLines, em = 0.8 }: FitOptions): number {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => Array.from(w).length));
  for (let size = max; size > min; size -= 2) {
    if (longest * em * size <= width && estimateLines(text, size, width, em) <= maxLines) return size;
  }
  return min;
}

/** Archivo Black advances (em) for the characters a money figure uses. */
function moneyUnits(text: string): number {
  let units = 0;
  for (const ch of Array.from(text)) {
    if (/[0-9]/.test(ch)) units += 0.72;
    else if (ch === "," || ch === ".") units += 0.32;
    else if (ch === " " || ch === " ") units += 0.3;
    else units += 0.8;
  }
  return units;
}

/** Font size that keeps the FINAL total on one line; count-up values are never longer. */
export function moneyFontSize(finalText: string, width: number, max = 132): number {
  const units = moneyUnits(finalText);
  if (units <= 0) return max;
  return Math.max(40, Math.min(max, Math.floor(width / units)));
}

/**
 * The total shown at `frame`: $0.00 before the count, an eased count-up in
 * between, and the exact pre-formatted `text` from `countEnd` to the end, so
 * the last frames can never show a mid-count value.
 */
export function totalTextAt(frame: number, total: { value: number; text: string; currency: string }): string {
  const { countStart, countEnd } = QUOTE_VIDEO_TIMELINE;
  if (frame >= countEnd) return total.text;
  const p = interpolate(frame, [countStart, countEnd], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const value = Math.round(total.value * p * 100) / 100;
  return formatCurrency(value, total.currency);
}

/** Box for a logo of aspect `aspect` (w/h) inside `maxW` × `maxH`, never thinner than `minH`. */
export function logoBox(aspect: number | null | undefined, maxW: number, maxH: number, minH = maxH * 0.45) {
  const a = typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  let w = maxW;
  let h = w / a;
  if (h > maxH) {
    h = maxH;
    w = h * a;
  }
  if (h < minH) h = minH;
  return { width: Math.round(w), height: Math.round(h) };
}
