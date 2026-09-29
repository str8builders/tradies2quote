// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — text helpers (pure).
//
// Parsing the numbers drawings actually print ("6,470", "15440", "3600 ±",
// "2.4 x 3.0", "715×1,415") and simple geometry on text runs. Pure, so every
// rule here is unit-tested.
// ─────────────────────────────────────────────────────────────────────────

import type { TextItem } from "../types";

export type DimensionLabel = {
  /** Full-size millimetres as printed. */
  mm: number;
  /** "±", "approx" or "(approx)" printed with it. */
  approx: boolean;
};

const APPROX = /\s*(?:±|\+\/-|\(?approx\.?\)?|approximately)\s*/gi;

/**
 * A printed dimension in millimetres: "6,470", "15440", "90", "3600 ±",
 * "± 2000", "4850 approx". Not a dimension: dates, times, scales, levels
 * with decimals, sheet numbers, anything with letters.
 */
export function parseDimensionLabel(raw: string): DimensionLabel | null {
  const approx = /±|\+\/-|approx/i.test(raw);
  const s = raw.replace(APPROX, " ").trim();
  if (!/^\d{1,3}(?:,\d{3})+$|^\d{2,6}$/.test(s)) return null;
  const mm = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(mm) || mm < 10 || mm > 200_000) return null;
  return { mm, approx };
}

/**
 * A "W × H" size as printed in schedules and on plans, in millimetres:
 * "715×1,415", "1415x715", "1800 x 1200", and metres "2.4 x 3.0", "1.2x2.2".
 * The first number is the width.
 */
export function parseSizePair(raw: string): { widthMm: number; heightMm: number } | null {
  const m = raw.trim().match(/^(\d{1,2}(?:,\d{3})+|\d+(?:\.\d+)?)\s*[x×X*]\s*(\d{1,2}(?:,\d{3})+|\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1].replace(/,/g, ""));
  const b = Number(m[2].replace(/,/g, ""));
  if (!(a > 0 && b > 0)) return null;
  // Both under 10 with a decimal point or tiny → metres ("2.4 x 3.0").
  const metres = (m[1].includes(".") || m[2].includes(".") || (a < 10 && b < 10));
  const toMm = (v: number) => (metres ? Math.round(v * 1000) : v);
  const widthMm = toMm(a), heightMm = toMm(b);
  if (widthMm < 100 || heightMm < 100 || widthMm > 20_000 || heightMm > 20_000) return null;
  return { widthMm, heightMm };
}

/** Unit vector of the reading direction, page mm (y down). */
export function direction(t: Pick<TextItem, "angle">): [number, number] {
  const a = (t.angle * Math.PI) / 180;
  return [Math.cos(a), -Math.sin(a)];
}

/**
 * The middle of a text run, page mm: halfway along the baseline, lifted a
 * third of the font height towards the top of the glyphs.
 */
export function textCentre(t: Pick<TextItem, "x" | "y" | "angle" | "h" | "w">): [number, number] {
  const [dx, dy] = direction(t);
  // "Up" for the glyphs is the reading direction turned 90° anticlockwise.
  const [ux, uy] = [dy, -dx];
  return [t.x + (dx * t.w) / 2 + (ux * t.h) / 3, t.y + (dy * t.w) / 2 + (uy * t.h) / 3];
}

/** Axis-aligned box around a text run, page mm: [x0, y0, x1, y1]. */
export function textBox(t: Pick<TextItem, "x" | "y" | "angle" | "h" | "w">): [number, number, number, number] {
  const [dx, dy] = direction(t);
  const [ux, uy] = [dy, -dx];
  const pts: Array<[number, number]> = [
    [t.x, t.y],
    [t.x + dx * t.w, t.y + dy * t.w],
    [t.x + ux * t.h, t.y + uy * t.h],
    [t.x + dx * t.w + ux * t.h, t.y + dy * t.w + uy * t.h],
  ];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Is the angle horizontal-ish (reads left→right or right→left)? */
export function isHorizontal(angle: number): boolean {
  const a = ((angle % 180) + 180) % 180;
  return a <= 3 || a >= 177;
}

/** Is the angle vertical-ish (reads up or down the page)? */
export function isVertical(angle: number): boolean {
  const a = ((angle % 180) + 180) % 180;
  return Math.abs(a - 90) <= 3;
}

/** Text runs inside a page-mm box. */
export function textIn(items: readonly TextItem[], box: [number, number, number, number]): TextItem[] {
  const [x0, y0, x1, y1] = box;
  return items.filter((t) => {
    const [cx, cy] = textCentre(t);
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  });
}

/** Lowercased, single-spaced text of a set of runs, in reading order (rows top→bottom, then left→right). */
export function joinText(items: readonly TextItem[]): string {
  return [...items]
    .sort((a, b) => (Math.abs(a.y - b.y) > Math.max(a.h, b.h) * 0.6 ? a.y - b.y : a.x - b.x))
    .map((t) => t.s)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
