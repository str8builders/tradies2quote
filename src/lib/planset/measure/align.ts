// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — line two sheets up (pure).
//
// A plan set draws the same floor plan on several sheets (floor plan,
// dimension plan, bracing plan, lintel plan), usually at the same scale but
// placed differently on the page. If the wall shapes of sheet A land exactly
// on sheet B's after one shift, A is the same drawing at the same scale:
//   - A's scale is proven by B's (the floor plan has few dimensions of its
//     own; its dimension-plan sibling has 93);
//   - tags read off A (window W03) can be placed on B's walls.
// ─────────────────────────────────────────────────────────────────────────

import type { FillShape } from "../types";

export type SheetAlignment = {
  /** Add to a point on sheet A to get the same point on sheet B, page mm. */
  dx: number;
  dy: number;
  /** A's wall-like shapes that land on one of B's. */
  matches: number;
  /** matches ÷ the smaller sheet's wall-like shape count. */
  share: number;
};

/** Enough shared shapes to call two sheets the same drawing. */
export const MIN_ALIGN_MATCHES = 20;
export const MIN_ALIGN_SHARE = 0.4;

type Box = [number, number, number, number];

/** Wall-like shapes: long thin filled rectangles (any scale). */
function strips(fills: readonly FillShape[]): Box[] {
  return fills
    .map((f) => f.bbox)
    .filter(([x0, y0, x1, y1]) => {
      const w = x1 - x0, h = y1 - y0;
      return Math.min(w, h) > 0.2 && Math.min(w, h) < 5 && Math.max(w, h) >= Math.min(w, h) * 1.5;
    });
}

/**
 * The shift that lays sheet A's wall shapes onto sheet B's, if one exists.
 * Same-size shapes vote for their offset; the winning offset is then
 * counted exactly. Null when too few shapes agree.
 */
export function alignSheets(a: readonly FillShape[], b: readonly FillShape[]): SheetAlignment | null {
  const sa = strips(a), sb = strips(b);
  if (sa.length < MIN_ALIGN_MATCHES || sb.length < MIN_ALIGN_MATCHES) return null;
  const votes = new Map<string, number>();
  // Bucket B by rounded size so each A shape only meets same-size shapes.
  const bySize = new Map<string, Box[]>();
  const sizeKey = (r: Box) => `${Math.round((r[2] - r[0]) * 10)}x${Math.round((r[3] - r[1]) * 10)}`;
  for (const r of sb) {
    const k = sizeKey(r);
    const list = bySize.get(k);
    if (list) list.push(r);
    else bySize.set(k, [r]);
  }
  for (const r of sa) {
    for (const q of bySize.get(sizeKey(r)) ?? []) {
      const key = `${Math.round((q[0] - r[0]) * 10)},${Math.round((q[1] - r[1]) * 10)}`;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestVotes = 0;
  for (const [k, v] of votes) if (v > bestVotes) [best, bestVotes] = [k, v];
  if (!best || bestVotes < MIN_ALIGN_MATCHES) return null;
  const [dx, dy] = best.split(",").map((v) => Number(v) / 10);
  const matches = sa.filter((r) =>
    sb.some((q) => Math.abs(r[0] + dx - q[0]) <= 0.2 && Math.abs(r[1] + dy - q[1]) <= 0.2 && Math.abs(r[2] + dx - q[2]) <= 0.2 && Math.abs(r[3] + dy - q[3]) <= 0.2),
  ).length;
  const share = matches / Math.min(sa.length, sb.length);
  if (matches < MIN_ALIGN_MATCHES || share < MIN_ALIGN_SHARE) return null;
  return { dx, dy, matches, share: Math.round(share * 1000) / 1000 };
}
