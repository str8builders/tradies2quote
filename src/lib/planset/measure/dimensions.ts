// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — dimensions, the scale proof and dimension chains (pure).
//
// A dimension on a CAD drawing is a printed number sitting just off a thin
// line whose drawn length IS the dimension at the sheet's scale. Pairing
// each number with its line gives, for every dimension, "real mm per paper
// mm". When dozens of them agree, the sheet's scale is PROVEN from the
// drawing itself — whatever the title block claims (one of the owner's
// sheets says "1:100, 1:84.8036 @ A3"; its 32 dimensions all say 1:100).
//
// Chains: a row of dimensions laid end to end must add up to the overall
// dimension drawn beside it. That is the "check it two ways" test.
// ─────────────────────────────────────────────────────────────────────────

import type { Segment, SheetRaw, TextItem } from "../types";
import { direction, isHorizontal, isVertical, parseDimensionLabel, textCentre } from "../sheet/text";

export type Orientation = "h" | "v";

export type Dimension = {
  /** Text item id on the sheet. */
  textId: number;
  mm: number;
  approx: boolean;
  orientation: Orientation;
  /** The dimension line it labels, page mm (null when none was found). */
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  /** Drawn length of that line, page mm. */
  paperMm: number | null;
  /** Real mm per paper mm (the scale denominator) for this one dimension. */
  ratio: number | null;
};

/** Dimension lines are thin, solid strokes. */
const MAX_DIM_LINE_WIDTH = 0.36;
/** How far off its line a label may sit, page mm. */
const MAX_OFFSET = 3.2;
const GRID = 10;

/** Pair every printed dimension on the sheet with the line it labels. */
export function readDimensions(sheet: Pick<SheetRaw, "text" | "segs">): Dimension[] {
  const index = new SegmentGrid(sheet.segs.filter((s) => !s.dashed && s.w <= MAX_DIM_LINE_WIDTH));
  const out: Dimension[] = [];
  for (const t of sheet.text) {
    const label = parseDimensionLabel(t.s);
    if (!label) continue;
    const orientation: Orientation | null = isHorizontal(t.angle) ? "h" : isVertical(t.angle) ? "v" : null;
    if (!orientation) continue;
    const match = matchLine(t, index);
    out.push({
      textId: t.id,
      mm: label.mm,
      approx: label.approx,
      orientation,
      line: match ? { x1: match.x1, y1: match.y1, x2: match.x2, y2: match.y2 } : null,
      paperMm: match ? round3(Math.hypot(match.x2 - match.x1, match.y2 - match.y1)) : null,
      ratio: match ? round3(label.mm / Math.hypot(match.x2 - match.x1, match.y2 - match.y1)) : null,
    });
  }
  return out;
}

function matchLine(t: TextItem, index: SegmentGrid): Segment | null {
  const [dx, dy] = direction(t);
  const [cx, cy] = textCentre(t);
  // "Down" from the glyphs, where a dimension line normally sits.
  const [nx, ny] = [-dy, dx];
  let best: { seg: Segment; score: number } | null = null;
  for (const s of index.near(cx, cy, Math.max(MAX_OFFSET, t.w))) {
    const sx = s.x2 - s.x1, sy = s.y2 - s.y1;
    const len = Math.hypot(sx, sy);
    if (len < 0.3) continue;
    // Parallel to the label (within ~3°).
    const cross = Math.abs((sx * dy - sy * dx) / len);
    if (cross > 0.055) continue;
    // Where the label's centre falls along the segment.
    const ux = sx / len, uy = sy / len;
    const along = (cx - s.x1) * ux + (cy - s.y1) * uy;
    if (along < -0.3 || along > len + 0.3) continue;
    // Perpendicular offset of the label BASELINE from the line (positive = line below the text).
    const off = (s.x1 - t.x) * nx + (s.y1 - t.y) * ny;
    if (off < -t.h * 1.6 || off > MAX_OFFSET) continue;
    const centring = Math.abs(along - len / 2) / Math.max(len, 1);
    // Prefer lines just below the text, centred under it.
    const score = Math.abs(off - 0.8) + (off < 0 ? 1.5 : 0) + centring * 2;
    if (!best || score < best.score) best = { seg: s, score };
  }
  return best?.seg ?? null;
}

// ── Scale proof ──────────────────────────────────────────────────────────

export type ScaleProof = {
  /** Real mm per paper mm, e.g. 100 for 1:100. Snapped to a standard scale within 1%. */
  ratio: number;
  /** Dimensions agreeing with it. */
  count: number;
  /** Share of all matched dimensions on the sheet. */
  share: number;
  /** Page-mm box around the agreeing dimensions (the viewport it applies to). */
  region: [number, number, number, number];
};

const STANDARD_RATIOS = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000];
/** A scale is proven when at least this many dimensions agree. */
export const MIN_PROOF_DIMENSIONS = 5;

/**
 * Cluster the per-dimension ratios. Each cluster of ≥ MIN_PROOF_DIMENSIONS
 * agreeing dimensions (within 1.5%) proves a scale for the region they cover.
 * A sheet can have several (a 1:100 plan with 1:10 details).
 */
export function proveScales(dims: readonly Dimension[], textById: (id: number) => TextItem | undefined): ScaleProof[] {
  const matched = dims.filter((d) => d.ratio && !d.approx && d.ratio > 0.5 && d.ratio < 5000);
  const sorted = [...matched].sort((a, b) => a.ratio! - b.ratio!);
  const clusters: Dimension[][] = [];
  for (const d of sorted) {
    const last = clusters.at(-1);
    if (last && d.ratio! <= median(last.map((x) => x.ratio!)) * 1.015) last.push(d);
    else clusters.push([d]);
  }
  const proofs: ScaleProof[] = [];
  for (const c of clusters) {
    if (c.length < MIN_PROOF_DIMENSIONS) continue;
    const m = median(c.map((x) => x.ratio!));
    const std = STANDARD_RATIOS.find((r) => Math.abs(m - r) / r <= 0.01);
    const boxes = c.map((d) => textById(d.textId)).filter((t): t is TextItem => !!t).map((t) => [t.x, t.y] as const);
    proofs.push({
      ratio: std ?? round3(m),
      count: c.length,
      share: round3(c.length / Math.max(matched.length, 1)),
      region: [
        Math.min(...boxes.map((b) => b[0])),
        Math.min(...boxes.map((b) => b[1])),
        Math.max(...boxes.map((b) => b[0])),
        Math.max(...boxes.map((b) => b[1])),
      ],
    });
  }
  return proofs.sort((a, b) => b.count - a.count);
}

// ── Chains ───────────────────────────────────────────────────────────────

export type DimChain = {
  orientation: Orientation;
  /** y of a horizontal chain's line, x of a vertical one (page mm). */
  at: number;
  /** Start and end along the chain, page mm. */
  from: number;
  to: number;
  parts: Dimension[];
  sumMm: number;
};

export type ChainCheck = {
  chain: DimChain;
  /** The single dimension spanning the same extent (the overall), if drawn. */
  overall: Dimension;
  /** chain.sumMm − overall.mm. */
  differenceMm: number;
  ok: boolean;
};

/** Dimensions whose lines sit end to end on one line form a chain. */
export function buildChains(dims: readonly Dimension[]): DimChain[] {
  const withLine = dims.filter((d) => d.line);
  const chains: DimChain[] = [];
  for (const orientation of ["h", "v"] as const) {
    const items = withLine
      .filter((d) => d.orientation === orientation)
      .map((d) => {
        const l = d.line!;
        const at = orientation === "h" ? (l.y1 + l.y2) / 2 : (l.x1 + l.x2) / 2;
        const a = orientation === "h" ? Math.min(l.x1, l.x2) : Math.min(l.y1, l.y2);
        const b = orientation === "h" ? Math.max(l.x1, l.x2) : Math.max(l.y1, l.y2);
        return { d, at, a, b };
      })
      .sort((p, q) => p.at - q.at || p.a - q.a);
    // Rows: same `at` within 0.3 mm.
    const rows: (typeof items)[] = [];
    for (const it of items) {
      const row = rows.find((r) => Math.abs(r[0].at - it.at) <= 0.3);
      if (row) row.push(it);
      else rows.push([it]);
    }
    for (const row of rows) {
      row.sort((p, q) => p.a - q.a);
      let run: typeof row = [];
      const flush = () => {
        if (run.length >= 2) {
          chains.push({
            orientation,
            at: round3(run[0].at),
            from: round3(run[0].a),
            to: round3(run.at(-1)!.b),
            parts: run.map((r) => r.d),
            sumMm: run.reduce((s, r) => s + r.d.mm, 0),
          });
        }
        run = [];
      };
      for (const it of row) {
        const prev = run.at(-1);
        if (prev && Math.abs(it.a - prev.b) > 0.4) flush();
        run.push(it);
      }
      flush();
    }
  }
  return chains;
}

/**
 * For each chain, find a single parallel dimension spanning the same extent
 * (the overall) and compare. Approximate (±) parts make the check loose.
 */
export function checkChains(chains: readonly DimChain[], dims: readonly Dimension[]): ChainCheck[] {
  const out: ChainCheck[] = [];
  for (const chain of chains) {
    const overall = dims.find((d) => {
      if (!d.line || d.orientation !== chain.orientation || chain.parts.includes(d)) return false;
      const l = d.line;
      const a = chain.orientation === "h" ? Math.min(l.x1, l.x2) : Math.min(l.y1, l.y2);
      const b = chain.orientation === "h" ? Math.max(l.x1, l.x2) : Math.max(l.y1, l.y2);
      return Math.abs(a - chain.from) <= 0.5 && Math.abs(b - chain.to) <= 0.5;
    });
    if (!overall) continue;
    const diff = chain.sumMm - overall.mm;
    const loose = overall.approx || chain.parts.some((p) => p.approx);
    const tolerance = loose ? Math.max(50, overall.mm * 0.01) : Math.max(5, overall.mm * 0.002);
    out.push({ chain, overall, differenceMm: diff, ok: Math.abs(diff) <= tolerance });
  }
  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Buckets segments into a coarse grid so each label only checks nearby lines. */
class SegmentGrid {
  private cells = new Map<string, Segment[]>();
  constructor(segs: readonly Segment[]) {
    for (const s of segs) {
      const x0 = Math.floor(Math.min(s.x1, s.x2) / GRID), x1 = Math.floor(Math.max(s.x1, s.x2) / GRID);
      const y0 = Math.floor(Math.min(s.y1, s.y2) / GRID), y1 = Math.floor(Math.max(s.y1, s.y2) / GRID);
      // Long lines touch many cells; cap the fan-out (a page border isn't a dimension line).
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue;
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = `${gx},${gy}`;
        const cell = this.cells.get(k);
        if (cell) cell.push(s);
        else this.cells.set(k, [s]);
      }
    }
  }
  near(x: number, y: number, radius: number): Segment[] {
    const seen = new Set<Segment>();
    const gx0 = Math.floor((x - radius) / GRID), gx1 = Math.floor((x + radius) / GRID);
    const gy0 = Math.floor((y - radius) / GRID), gy1 = Math.floor((y + radius) / GRID);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      for (const s of this.cells.get(`${gx},${gy}`) ?? []) seen.add(s);
    }
    return [...seen];
  }
}
