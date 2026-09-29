// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — walls drawn as two parallel lines (pure).
//
// Not every drafter fills walls (the owner's renovation and addition sets
// draw them as pairs of lines). Two long parallel strokes a wall-thickness
// apart, overlapping along their length, are one wall strip. The strips are
// handed to readWalls() as if they were filled, so joining, openings, the
// outside flood fill and the floor area all work the same way.
//
// A DASHED pair is a wall to be removed (the usual renovation legend) — it
// is kept, marked "remove", and never priced.
// ─────────────────────────────────────────────────────────────────────────

import type { FillShape, Segment } from "../types";

export const REMOVE_COLOUR = "remove";
export const LINE_WALL_COLOUR = "line";

type Axis = { seg: Segment; at: number; a: number; b: number };

/**
 * Wall strips from parallel line pairs, as fill shapes for readWalls().
 * `ratio` is the proven scale (real mm per page mm).
 */
export function wallStripsFromLines(segs: readonly Segment[], ratio: number, opts: { minThicknessMm?: number; maxThicknessMm?: number; minLengthMm?: number } = {}): FillShape[] {
  const minT = (opts.minThicknessMm ?? 70) / ratio;
  const maxT = (opts.maxThicknessMm ?? 320) / ratio;
  const minL = (opts.minLengthMm ?? 500) / ratio;
  const out: FillShape[] = [];
  for (const o of ["h", "v"] as const) {
    const lines: Axis[] = segs
      .filter((s) => (o === "h" ? Math.abs(s.y1 - s.y2) < 0.02 : Math.abs(s.x1 - s.x2) < 0.02) && s.w < 1.2)
      .map((s) => ({
        seg: s,
        at: o === "h" ? s.y1 : s.x1,
        a: o === "h" ? Math.min(s.x1, s.x2) : Math.min(s.y1, s.y2),
        b: o === "h" ? Math.max(s.x1, s.x2) : Math.max(s.y1, s.y2),
      }))
      .filter((l) => l.b - l.a >= minL)
      .sort((p, q) => p.at - q.at);
    const used = new Set<Axis>();
    for (let i = 0; i < lines.length; i++) {
      const p = lines[i];
      if (used.has(p)) continue;
      let best: { q: Axis; overlap: number } | null = null;
      for (let j = i + 1; j < lines.length; j++) {
        const q = lines[j];
        const gap = q.at - p.at;
        if (gap < minT) continue;
        if (gap > maxT) break;
        if (used.has(q) || q.seg.dashed !== p.seg.dashed) continue;
        const overlap = Math.min(p.b, q.b) - Math.max(p.a, q.a);
        // The two faces must run together for most of the shorter one.
        if (overlap < minL || overlap < 0.6 * Math.min(p.b - p.a, q.b - q.a)) continue;
        if (!best || overlap > best.overlap) best = { q, overlap };
      }
      if (!best) continue;
      used.add(p);
      used.add(best.q);
      const a = Math.max(p.a, best.q.a), b = Math.min(p.b, best.q.b);
      const [x0, y0, x1, y1] = o === "h" ? [a, p.at, b, best.q.at] : [p.at, a, best.q.at, b];
      out.push({ c: p.seg.dashed ? REMOVE_COLOUR : LINE_WALL_COLOUR, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], bbox: [x0, y0, x1, y1] });
    }
  }
  return out;
}
