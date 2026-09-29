// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — tables and schedules (pure).
//
// Schedules are where a plan set states its facts outright: every window's
// size, every door, every beam and wall type, keyed by a mark (W01, D12,
// G49h, BW1) that the drawings then point at. This module reads them from a
// sheet's text and rules, in two steps:
//
//   readTables     geometry first. Thin axis-aligned strokes are merged into
//                  rules, rules that touch form a grid, and the grid gives
//                  cells; text goes to the cell its centre lies in. Also
//                  unruled blocks (a "Schedule of Finishes" typed straight
//                  onto the plan) from column-aligned text under a title.
//   readSchedules  meaning second. A table with a header row (or a header
//                  column — the transposed ArchiCAD layout, one window per
//                  column) and real marks becomes records keyed by mark, and
//                  gets a kind (windows, doors, beams…). Pasted-in standards
//                  (NZS 3604 span tables, manufacturers' tables) are tagged
//                  "reference_standard" so nothing uses them as job facts.
//
// Two real-world quirks drive the geometry:
//   - CAD schedules draw each cell's border as its own piece, and one plan
//     set leaves out the label column's right-hand rule altogether. Where
//     the pieces of many rules all break at the same x, that x is a column
//     divider even though no line is drawn there.
//   - Two schedules stacked edge to edge can share rules. Rows are grouped
//     by which column dividers they have, so a change of columns starts a
//     new table.
//
// Nothing is invented: cell text is the drawing's own words, field keys are
// the header text lower-cased and single-spaced, and every record carries
// the text item ids it came from.
// ─────────────────────────────────────────────────────────────────────────

import type { SheetRaw, TextItem } from "../types";
import { textBox, textCentre } from "../sheet/text";

// ── Public types ─────────────────────────────────────────────────────────

export type TableCell = {
  row: number;
  col: number;
  /** The cell's words, lines joined in reading order with single spaces. */
  text: string;
  /** Text item ids on the sheet. */
  textIds: number[];
};

export type Table = {
  /** [x0, y0, x1, y1] around the cells (not the title band), page mm. */
  box: [number, number, number, number];
  rows: number;
  cols: number;
  /** Every row × col position, row-major. A merged cell's words sit in its top-left position. */
  cells: TableCell[];
  /** The band across the table's top, or the heading line just above it. */
  title: string | null;
  /** True when the grid comes from drawn rules; false for column-aligned text. */
  ruled: boolean;
};

export type ScheduleKind =
  | "windows"
  | "doors"
  | "lintels"
  | "beams"
  | "columns"
  | "walls"
  | "floors"
  | "finishes"
  | "fixings"
  | "drawing_list"
  | "reference_standard"
  | "other";

export type ScheduleRecord = {
  /** The identifier the drawings use: W01, D12, G49h, BW1, S000. A room name for finishes. */
  mark: string;
  /** Header text (lower-case, single-spaced) → the cell's own text. Empty cells are left out. */
  fields: Record<string, string>;
  /** Text item ids the record was read from. */
  textIds: number[];
};

export type Schedule = {
  kind: ScheduleKind;
  /** The table's own title, else the sheet's schedule title. */
  title: string | null;
  page: number;
  box: [number, number, number, number];
  /** Normalised header texts (the row labels when transposed). */
  headers: string[];
  /** Empty for "reference_standard": pasted-in tables are never job facts. */
  records: ScheduleRecord[];
  /** True when the field names run down the first column and each further column is one record. */
  transposed: boolean;
};

type Box = [number, number, number, number];

/** What the grid knew that `Table` doesn't say: row heights, merged-up cells, the frame with its title. */
type Geometry = { rowH: number[]; up: boolean[][]; full: Box };
const GEOMETRY = new WeakMap<Table, Geometry>();

// ── Tunables (page mm) ───────────────────────────────────────────────────

/** A stroke is "straight" if it wanders less than this. */
const AXIS_TOL = 0.2;
/** Table rules are thin; a stroke wider than this is a wall or a border of a plan. */
const MAX_RULE_WIDTH = 1.0;
/** Shortest stroke worth keeping (CAD leaves zero-length artefacts). */
const MIN_PIECE = 0.3;
/** Filled rectangles thinner than this are rules drawn as fills. */
const THIN_FILL = 0.8;
/** Strokes this close are the same rule. */
const POS_TOL = 0.35;
/** Pieces of one rule with a gap up to this are joined. */
const MERGE_GAP = 0.9;
/** Shortest merged rule that can be part of a grid. */
const MIN_RUN = 3;
/** Rules whose ends are this close touch. */
const JOIN_TOL = 1.0;
/** Two piece endpoints this close are the same break. */
const CUT_TOL = 0.4;
/** Rows thinner than this are double-line slivers, not rows. */
const MIN_ROW_H = 1.2;
/** Dividers this close are one divider. */
const DIVIDER_TOL = 1.0;
/** A component with more rules than this is a drawing, not a table. */
const MAX_COMPONENT_RUNS = 1200;
/** More cells than this is a hatch pattern, not a schedule. */
const MAX_CELLS = 6000;
/** A heading this far above a table still belongs to it. */
const MAX_HEADING_GAP = 14;

// ── 1. Rules ─────────────────────────────────────────────────────────────

type Piece = { pos: number; a: number; b: number };
/** One merged rule: `pos` across, `a..b` along, `cuts` every place one of its pieces began or ended. */
type Run = { pos: number; a: number; b: number; cuts: number[] };
type Interval = [number, number];

function collectPieces(sheet: SheetRaw): { h: Piece[]; v: Piece[] } {
  const h: Piece[] = [];
  const v: Piece[] = [];
  for (const s of sheet.segs) {
    if (s.dashed || s.w > MAX_RULE_WIDTH) continue;
    const dx = Math.abs(s.x2 - s.x1);
    const dy = Math.abs(s.y2 - s.y1);
    if (dy <= AXIS_TOL && dx >= MIN_PIECE) h.push({ pos: (s.y1 + s.y2) / 2, a: Math.min(s.x1, s.x2), b: Math.max(s.x1, s.x2) });
    else if (dx <= AXIS_TOL && dy >= MIN_PIECE) v.push({ pos: (s.x1 + s.x2) / 2, a: Math.min(s.y1, s.y2), b: Math.max(s.y1, s.y2) });
  }
  // Some CAD writes a rule as a very thin filled rectangle.
  for (const f of sheet.fills) {
    if (f.pts.length > 6) continue;
    const [x0, y0, x1, y1] = f.bbox;
    const w = x1 - x0;
    const hh = y1 - y0;
    if (hh <= THIN_FILL && w >= MIN_PIECE) h.push({ pos: (y0 + y1) / 2, a: x0, b: x1 });
    else if (w <= THIN_FILL && hh >= MIN_PIECE) v.push({ pos: (x0 + x1) / 2, a: y0, b: y1 });
  }
  return { h, v };
}

/** Merge pieces on the same line into rules, remembering where the pieces met. */
function buildRuns(pieces: readonly Piece[]): Run[] {
  const sorted = [...pieces].sort((p, q) => p.pos - q.pos);
  const runs: Run[] = [];
  let i = 0;
  while (i < sorted.length) {
    const anchor = sorted[i].pos;
    const group: Piece[] = [];
    while (i < sorted.length && sorted[i].pos - anchor <= POS_TOL) group.push(sorted[i++]);
    let weight = 0;
    let sum = 0;
    for (const p of group) {
      weight += p.b - p.a;
      sum += p.pos * (p.b - p.a);
    }
    const pos = weight > 0 ? sum / weight : anchor;
    group.sort((p, q) => p.a - q.a);
    let cur: Run | null = null;
    let ends: number[] = [];
    const close = () => {
      if (!cur || cur.b - cur.a < MIN_RUN) return;
      cur.cuts = ends;
      runs.push(cur);
    };
    for (const p of group) {
      if (cur && p.a <= cur.b + MERGE_GAP) {
        cur.b = Math.max(cur.b, p.b);
        ends.push(p.a, p.b);
      } else {
        close();
        cur = { pos, a: p.a, b: p.b, cuts: [] };
        ends = [p.a, p.b];
      }
    }
    close();
  }
  return runs;
}

function mergeIntervals(list: readonly Interval[], gap = MERGE_GAP): Interval[] {
  const sorted = list.map((iv): Interval => [iv[0], iv[1]]).sort((p, q) => p[0] - q[0]);
  const out: Interval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1] + gap) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv);
  }
  return out;
}

function intersectIntervals(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const p of a) {
    for (const q of b) {
      const lo = Math.max(p[0], q[0]);
      const hi = Math.min(p[1], q[1]);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out;
}

/** Length of `iv` that lies inside [lo, hi]. */
function covered(iv: readonly Interval[], lo: number, hi: number): number {
  let sum = 0;
  for (const [a, b] of iv) {
    const s = Math.max(a, lo);
    const e = Math.min(b, hi);
    if (e > s) sum += e - s;
  }
  return sum;
}

const total = (iv: readonly Interval[]) => iv.reduce((s, [a, b]) => s + (b - a), 0);

/** Sorted, with values closer than `tol` to the one before dropped. */
function mergeNear(values: readonly number[], tol: number): number[] {
  const sorted = [...values].sort((p, q) => p - q);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

// ── 2. Rules that touch form a component ─────────────────────────────────

type Component = { h: Run[]; v: Run[] };

function connect(h: readonly Run[], v: readonly Run[]): Component[] {
  const n = h.length;
  const parent = Array.from({ length: n + v.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (p: number, q: number) => {
    const rp = find(p);
    const rq = find(q);
    if (rp !== rq) parent[Math.max(rp, rq)] = Math.min(rp, rq);
  };
  const order = v.map((_, i) => i).sort((p, q) => v[p].pos - v[q].pos);
  const positions = order.map((i) => v[i].pos);
  h.forEach((hr, i) => {
    // First vertical rule at or right of this rule's left end.
    let lo = 0;
    let hi = positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[mid] < hr.a - JOIN_TOL) lo = mid + 1;
      else hi = mid;
    }
    for (let k = lo; k < order.length && positions[k] <= hr.b + JOIN_TOL; k++) {
      const vr = v[order[k]];
      if (hr.pos >= vr.a - JOIN_TOL && hr.pos <= vr.b + JOIN_TOL) join(i, n + order[k]);
    }
  });
  const groups = new Map<number, Component>();
  for (let i = 0; i < n + v.length; i++) {
    const root = find(i);
    let g = groups.get(root);
    if (!g) groups.set(root, (g = { h: [], v: [] }));
    if (i < n) g.h.push(h[i]);
    else g.v.push(v[i - n]);
  }
  return [...groups.values()];
}

/**
 * Dividers nobody drew. When many parallel rules all break at the same
 * position — cell borders drawn piece by piece — that position is a divider
 * across them, even if no line was stroked there.
 */
function impliedRuns(along: readonly Run[], across: readonly Run[]): Run[] {
  const events: Array<{ at: number; run: number }> = [];
  along.forEach((r, i) => {
    for (const c of r.cuts) events.push({ at: c, run: i });
  });
  events.sort((p, q) => p.at - q.at);
  const out: Run[] = [];
  let k = 0;
  while (k < events.length) {
    const anchor = events[k].at;
    const group: Array<{ at: number; run: number }> = [];
    while (k < events.length && events[k].at - anchor <= CUT_TOL) group.push(events[k++]);
    const supporters = [...new Set(group.map((e) => e.run))];
    if (supporters.length < 3) continue;
    const at = group.reduce((s, e) => s + e.at, 0) / group.length;
    let lo = Infinity;
    let hi = -Infinity;
    for (const i of supporters) {
      lo = Math.min(lo, along[i].pos);
      hi = Math.max(hi, along[i].pos);
    }
    const spanning = along.filter((r) => r.pos >= lo - 0.5 && r.pos <= hi + 0.5 && r.a - 0.6 <= at && r.b + 0.6 >= at).length;
    if (supporters.length < 0.6 * spanning) continue;
    const drawn = across.some((r) => Math.abs(r.pos - at) <= 0.8 && Math.min(r.b, hi) - Math.max(r.a, lo) >= 0.9 * (hi - lo));
    if (drawn) continue;
    out.push({ pos: at, a: lo, b: hi, cuts: [] });
  }
  return out;
}

// ── 3. Grid lines, rows, and stacked tables ──────────────────────────────

/** All rules on one line of the grid, merged into intervals. */
type GridLine = { pos: number; iv: Interval[] };

function groupLines(runs: readonly Run[]): GridLine[] {
  const sorted = [...runs].sort((p, q) => p.pos - q.pos);
  const lines: GridLine[] = [];
  let i = 0;
  while (i < sorted.length) {
    const anchor = sorted[i].pos;
    const group: Run[] = [];
    while (i < sorted.length && sorted[i].pos - anchor <= 0.6) group.push(sorted[i++]);
    let weight = 0;
    let sum = 0;
    for (const r of group) {
      weight += r.b - r.a;
      sum += r.pos * (r.b - r.a);
    }
    lines.push({ pos: weight > 0 ? sum / weight : anchor, iv: mergeIntervals(group.map((r): Interval => [r.a, r.b])) });
  }
  return lines;
}

/** Join lines closer than `minGap` into the one before (double rules). */
function dropSlivers(lines: GridLine[], minGap: number): GridLine[] {
  const out: GridLine[] = [];
  for (const l of lines) {
    const last = out[out.length - 1];
    if (last && l.pos - last.pos < minGap) last.iv = mergeIntervals([...last.iv, ...l.iv]);
    else out.push({ pos: l.pos, iv: l.iv.map((iv): Interval => [iv[0], iv[1]]) });
  }
  return out;
}

function isSubset(a: readonly number[], b: readonly number[]): boolean {
  return a.every((x) => b.some((y) => Math.abs(x - y) <= DIVIDER_TOL));
}

/** A run of table rows sharing one set of column dividers. */
type RowGroup = { first: number; last: number };

type GridPlan = {
  ys: GridLine[];
  /** Column dividers each row band has, as x positions (null: not a row of a grid). */
  bandSig: Array<number[] | null>;
  groups: RowGroup[];
};

function planGrid(comp: Component): GridPlan | null {
  const allH = [...comp.h, ...impliedRuns(comp.v, comp.h)];
  const allV = [...comp.v, ...impliedRuns(comp.h, comp.v)];
  const hMin = Math.min(...allH.map((r) => r.a));
  const hMax = Math.max(...allH.map((r) => r.b));
  const vMin = Math.min(...allV.map((r) => r.a));
  const vMax = Math.max(...allV.map((r) => r.b));
  // A line has to be a real share of the structure, or it's a stub of some symbol: a quarter of the
  // structure's width for a row rule, a seventh of its height for a column rule.
  const ys = dropSlivers(groupLines(allH), MIN_ROW_H).filter((l) => total(l.iv) >= Math.max(6, 0.25 * (hMax - hMin)));
  const xs = dropSlivers(groupLines(allV), MIN_ROW_H).filter((l) => total(l.iv) >= Math.max(6, 0.15 * (vMax - vMin)));
  if (ys.length < 2 || xs.length < 2) return null;

  const bandSig: Array<number[] | null> = [];
  for (let r = 0; r + 1 < ys.length; r++) {
    const y0 = ys[r].pos;
    const y1 = ys[r + 1].pos;
    const dividers = xs.filter((l) => covered(l.iv, y0, y1) >= 0.7 * (y1 - y0)).map((l) => l.pos);
    // A band can also be open at either end: a last column with no rule of its own.
    const across = intersectIntervals(ys[r].iv, ys[r + 1].iv).sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    const sig = [...dividers];
    if (across) {
      if (dividers.length === 0 || dividers[0] - across[0] >= 3) sig.push(across[0]);
      if (dividers.length === 0 || across[1] - dividers[dividers.length - 1] >= 3) sig.push(across[1]);
    }
    const merged = mergeNear(sig, DIVIDER_TOL);
    bandSig.push(merged.length >= 2 ? merged : null);
  }

  // Consecutive bands whose dividers agree (one set contains the other) are one table.
  const groups: RowGroup[] = [];
  let r = 0;
  while (r < bandSig.length) {
    const first = bandSig[r];
    if (!first) {
      r++;
      continue;
    }
    let union = first;
    let last = r;
    while (last + 1 < bandSig.length) {
      const next = bandSig[last + 1];
      if (!next) break;
      if (isSubset(next, union)) {
        // same columns, or a merged row
      } else if (isSubset(union, next)) union = next;
      else break;
      last++;
    }
    if (last > r) groups.push({ first: r, last });
    r = last + 1;
  }
  return { ys, bandSig, groups };
}

// ── 4. Text into cells ───────────────────────────────────────────────────

type TextRef = { item: TextItem; cx: number; cy: number };

function refsOf(text: readonly TextItem[]): TextRef[] {
  return text.map((item) => {
    const [cx, cy] = textCentre(item);
    return { item, cx, cy };
  });
}

/** Runs into lines top→bottom, runs left→right along each. */
function orderedLines(items: readonly TextRef[]): TextRef[][] {
  const sorted = [...items].sort((p, q) => p.cy - q.cy || p.cx - q.cx);
  const lines: TextRef[][] = [];
  for (const t of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(t.cy - last[0].cy) <= Math.max(0.5 * t.item.h, 0.6)) last.push(t);
    else lines.push([t]);
  }
  for (const line of lines) line.sort((p, q) => p.cx - q.cx);
  return lines;
}

function joinRefs(items: readonly TextRef[]): string {
  return orderedLines(items)
    .map((line) => line.map((t) => t.item.s).join(" "))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function sets(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (p: number, q: number) => {
    const rp = find(p);
    const rq = find(q);
    if (rp !== rq) parent[Math.max(rp, rq)] = Math.min(rp, rq);
  };
  return { find, join };
}

/** Index of the interval [edges[i], edges[i+1]) holding v, or -1. */
function slot(edges: readonly number[], v: number): number {
  if (v < edges[0] || v > edges[edges.length - 1]) return -1;
  let lo = 0;
  let hi = edges.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (edges[mid] <= v) lo = mid;
    else hi = mid;
  }
  return lo;
}

const inBox = (b: Box, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

/** Keep JSON small: 0.01 mm is far below any drawing's precision. */
const r2 = (v: number) => Math.round(v * 100) / 100;
const roundBox = (b: Box): Box => [r2(b[0]), r2(b[1]), r2(b[2]), r2(b[3])];

function buildRuledTable(plan: GridPlan, group: RowGroup, refs: readonly TextRef[]): Table | null {
  const bands = plan.bandSig.slice(group.first, group.last + 1) as number[][];
  const ys = plan.ys.slice(group.first, group.last + 2).map((l) => l.pos);
  const xs = mergeNear(bands.flat(), DIVIDER_TOL);
  const R = bands.length;
  const C = xs.length - 1;
  if (C < 1 || R * C > MAX_CELLS) return null;

  // Cells: unit squares, merged wherever no rule stands between them.
  const uf = sets(R * C);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c + 1 < C; c++) {
      if (!bands[r].some((x) => Math.abs(x - xs[c + 1]) <= DIVIDER_TOL)) uf.join(r * C + c, r * C + c + 1);
    }
  }
  for (let r = 0; r + 1 < R; r++) {
    const line = plan.ys[group.first + r + 1];
    for (let c = 0; c < C; c++) {
      if (covered(line.iv, xs[c], xs[c + 1]) < 0.8 * (xs[c + 1] - xs[c])) uf.join(r * C + c, (r + 1) * C + c);
    }
  }

  const frame: Box = [xs[0], ys[0], xs[C], ys[R]];
  const buckets = new Map<number, TextRef[]>();
  let inside = 0;
  let crossing = 0;
  const cellAt = (x: number, y: number) => {
    const r = slot(ys, y);
    const c = slot(xs, x);
    return r < 0 || c < 0 || r >= R || c >= C ? -1 : uf.find(r * C + c);
  };
  for (const t of refs) {
    if (!inBox(frame, t.cx, t.cy)) continue;
    inside++;
    const root = cellAt(t.cx, t.cy);
    if (root < 0) continue;
    const list = buckets.get(root);
    if (list) list.push(t);
    else buckets.set(root, [t]);
    // Words in a real table sit inside their cell. A lattice of drawing lines cuts through them.
    const [bx0, by0, bx1, by1] = textBox(t.item);
    const inset = Math.max(0.3, 0.15 * t.item.h);
    const roots = new Set([cellAt(bx0 + inset, by0 + inset), cellAt(bx1 - inset, by0 + inset), cellAt(bx0 + inset, by1 - inset), cellAt(bx1 - inset, by1 - inset)]);
    if (roots.size > 1) crossing++;
  }

  // A band across the top that is one merged cell is the table's title.
  let shift = 0;
  let title: string | null = null;
  if (C >= 2 && R >= 3) {
    const top = uf.find(0);
    let spans = true;
    let alone = true;
    for (let c = 0; c < C; c++) {
      if (uf.find(c) !== top) spans = false;
      if (uf.find(C + c) === top) alone = false;
    }
    const words = buckets.get(top);
    if (spans && alone && words && words.length > 0) {
      shift = 1;
      title = joinRefs(words);
    }
  }

  // Edge columns with nothing in them (a rule that overhangs the table) are not part of it.
  const filledCol = (c: number) => {
    for (let r = shift; r < R; r++) if (buckets.get(uf.find(r * C + c))?.length) return true;
    return false;
  };
  let c0 = 0;
  while (c0 < C - 1 && !filledCol(c0)) c0++;
  let c1 = C - 1;
  while (c1 > c0 && !filledCol(c1)) c1--;
  const cols = c1 - c0 + 1;

  const rows = R - shift;
  const cells: TableCell[] = [];
  const up: boolean[][] = [];
  let filled = 0;
  let mostWords = 0;
  const tableBox = roundBox([xs[c0], ys[shift], xs[c1 + 1], ys[R]]);
  const area = (tableBox[2] - tableBox[0]) * (tableBox[3] - tableBox[1]);
  const areas = new Map<number, number>();
  for (let r = shift; r < R; r++) {
    const flags: boolean[] = [];
    for (let c = c0; c <= c1; c++) {
      const root = uf.find(r * C + c);
      areas.set(root, (areas.get(root) ?? 0) + (ys[r + 1] - ys[r]) * (xs[c + 1] - xs[c]));
      const words = root === r * C + c ? (buckets.get(root) ?? []) : [];
      const text = joinRefs(words);
      if (text) filled++;
      mostWords = Math.max(mostWords, words.length);
      flags.push(r > shift && root === uf.find((r - 1) * C + c));
      cells.push({ row: r - shift, col: c - c0, text, textIds: words.map((t) => t.item.id).sort((p, q) => p - q) });
    }
    up.push(flags);
  }
  // One cell that is most of the table and holds a page of words is a sheet border around a drawing.
  let framed = false;
  for (const [root, a] of areas) if (a > 0.5 * area && (buckets.get(root)?.length ?? 0) >= 12) framed = true;

  // Not a table: too small, too empty, a frame, or a lattice that cuts through its own words.
  if (rows < 2 || cols < 2 || filled < 4) return null;
  if (filled < 0.25 * rows * cols || framed || mostWords > 60) return null;
  if (crossing >= 3 && crossing > 0.12 * inside) return null;

  const table: Table = { box: tableBox, rows, cols, cells, title, ruled: true };
  GEOMETRY.set(table, { rowH: ys.slice(shift, R).map((y, i) => ys[shift + i + 1] - y), up, full: roundBox(frame) });
  return table;
}

function findRuledTables(sheet: SheetRaw, refs: readonly TextRef[]): Table[] {
  const pieces = collectPieces(sheet);
  if (pieces.h.length < 2 || pieces.v.length < 2) return [];
  const cap = (runs: Run[]) => (runs.length > 6000 ? [...runs].sort((p, q) => q.b - q.a - (p.b - p.a)).slice(0, 6000) : runs);
  const h = cap(buildRuns(pieces.h));
  const v = cap(buildRuns(pieces.v));
  const out: Table[] = [];
  for (const comp of connect(h, v)) {
    if (comp.h.length < 2 || comp.v.length < 2 || comp.h.length + comp.v.length > MAX_COMPONENT_RUNS) continue;
    // Skip lattices with no words in them (symbols, hatching).
    const reach: Box = [Math.min(...comp.h.map((r) => r.a)), Math.min(...comp.v.map((r) => r.a)), Math.max(...comp.h.map((r) => r.b)), Math.max(...comp.v.map((r) => r.b))];
    let words = 0;
    for (const t of refs) if (inBox(reach, t.cx, t.cy) && ++words >= 4) break;
    if (words < 4) continue;
    const plan = planGrid(comp);
    if (!plan) continue;
    for (const group of plan.groups) {
      const built = buildRuledTable(plan, group, refs);
      if (built) out.push(built);
    }
  }
  return out;
}

// ── 5. Headings ──────────────────────────────────────────────────────────

const isAcross = (t: Pick<TextItem, "angle">) => t.angle <= 3 || t.angle >= 357;

/** Words that make a line above a table its title even when it is set in the same size as the table. */
const TITLE_HINT = /schedule|\blist\b|register|legend|finishes|\btable\b|\bindex\b/i;

function medianHeight(items: readonly TextItem[]): number {
  if (items.length === 0) return 0;
  const hs = items.map((t) => t.h).sort((p, q) => p - q);
  return hs[Math.floor(hs.length / 2)];
}

/** The line of larger or title-like text just above a table that has no title band. */
function headingAbove(table: Table, sheet: SheetRaw, refs: readonly TextRef[], others: readonly Box[]): string | null {
  const [x0, y0, x1] = table.box;
  const near = refs.filter(
    (t) => isAcross(t.item) && t.cy <= y0 && t.cy >= y0 - MAX_HEADING_GAP && t.cx >= x0 - 3 && t.cx <= x1 + 3 && !others.some((b) => inBox(b, t.cx, t.cy)),
  );
  const line = orderedLines(near).pop();
  if (!line) return null;
  const text = joinRefs(line);
  if (text.length < 3 || text.length > 80) return null;
  const byId = new Map(sheet.text.map((t) => [t.id, t]));
  const body = medianHeight(table.cells.flatMap((c) => c.textIds.map((id) => byId.get(id)).filter((t): t is TextItem => !!t)));
  const bigger = body > 0 && line.some((t) => t.item.h >= 1.15 * body);
  return bigger || TITLE_HINT.test(text) ? text : null;
}

// ── 6. Unruled blocks ────────────────────────────────────────────────────

/** Runs on one baseline this close (× font height) are one line. */
const SAME_LINE = 0.4;
/** A gap wider than this (× font height) between runs starts a new cell. */
const CELL_GAP = 1.4;
/** A block's lines: no farther below the title than this. */
const MAX_BLOCK_HEIGHT = 220;
/** Left edges this close (page mm) are one column. */
const COLUMN_TOL = 1.5;
/** The next column starts within this many font heights of the last column's widest text. */
const MAX_GUTTER = 10;
const MAX_UNRULED_COLUMNS = 5;

type TextCell = { x0: number; x1: number; y: number; h: number; text: string; ids: number[]; runs: TextItem[] };
type TextLine = { y: number; h: number; cells: TextCell[] };

/** "Schedule of Finishes", "Finishes Schedule", "Room Finishes" — a heading, not a sentence that mentions a schedule. */
function isScheduleTitle(text: string): boolean {
  const t = text.trim();
  if (t.split(/\s+/).length > 5 || !/^[A-Z0-9]/.test(t) || /[.,;]$/.test(t)) return false;
  return /\bschedule\b/i.test(t) || /^(?:room |interior |internal |exterior |external )?finishes:?$/i.test(t);
}

function textLines(items: readonly TextItem[]): TextLine[] {
  const sorted = [...items].sort((p, q) => p.y - q.y || p.x - q.x);
  const rows: Array<{ y: number; h: number; runs: TextItem[] }> = [];
  for (const t of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(t.y - last.y) <= SAME_LINE * Math.max(t.h, last.h)) last.runs.push(t);
    else rows.push({ y: t.y, h: t.h, runs: [t] });
  }
  return rows.map((row) => ({ y: row.y, h: row.h, cells: cellsOfRuns(row.runs, () => -1) }));
}

/**
 * A line's runs into cells: a wide gap starts a new cell, and so does a run that begins on a known
 * column edge (`edgeOf` ≥ 0), however narrow the gap before it.
 */
function cellsOfRuns(runs: readonly TextItem[], edgeOf: (t: TextItem) => number): TextCell[] {
  const cells: TextCell[] = [];
  for (const t of [...runs].sort((p, q) => p.x - q.x)) {
    const last = cells[cells.length - 1];
    if (last && edgeOf(t) < 0 && t.x - last.x1 <= CELL_GAP * Math.max(t.h, last.h)) {
      last.text += ` ${t.s}`;
      last.x1 = Math.max(last.x1, t.x + t.w);
      last.ids.push(t.id);
      last.runs.push(t);
    } else cells.push({ x0: t.x, x1: t.x + t.w, y: t.y, h: t.h, text: t.s, ids: [t.id], runs: [t] });
  }
  return cells;
}

/** Group values within `tol` of the first in each group. */
function clusterBy<T>(items: readonly T[], key: (t: T) => number, tol: number): T[][] {
  const sorted = [...items].sort((p, q) => key(p) - key(q));
  const out: T[][] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && key(it) - key(last[0]) <= tol) last.push(it);
    else out.push([it]);
  }
  return out;
}

function findUnruledTables(sheet: SheetRaw, ruled: readonly Box[]): Table[] {
  const free = sheet.text.filter((t) => isAcross(t) && !ruled.some((b) => inBox(b, ...textCentre(t))));
  const lines = textLines(free);
  const out: Table[] = [];
  const used = new Set<number>();
  for (let li = 0; li < lines.length; li++) {
    for (const title of lines[li].cells) {
      if (title.text.length > 50 || !isScheduleTitle(title.text) || title.ids.some((id) => used.has(id))) continue;
      const block = unruledBlock(title, lines[li], lines.slice(li + 1));
      if (!block) continue;
      for (const id of block.ids) used.add(id);
      out.push(block.table);
    }
  }
  return out;
}

/** Column-aligned text under a title: a short token opens each record, its lines wrap beneath. */
function unruledBlock(head: TextCell, headLine: TextLine, below: readonly TextLine[]): { table: Table; ids: number[] } | null {
  const left = head.x0;
  const body = below.filter((l) => l.y > head.y + 0.5 * head.h && l.y <= head.y + MAX_BLOCK_HEIGHT);
  // Columns are where runs of text begin, whatever the gaps: a short name can sit close to its finishes.
  const runs = body.flatMap((l) => l.cells.flatMap((c) => c.runs.filter((r) => r.x >= left - 2.5).map((run) => ({ run, line: l }))));
  const clusters = clusterBy(runs, (r) => r.run.x, COLUMN_TOL);
  // The first column may hold a single token (one room); the others need to be lines of text.
  const first = clusters.find((cl) => Math.abs(cl[0].run.x - left) <= 2.5 + COLUMN_TOL);
  if (!first) return null;
  const firstLine = Math.min(...first.map((r) => r.line.y));

  // Walk the columns left to right; keep each one that sits close to the last kept column and starts
  // on the block's first line (text elsewhere on the plan doesn't). A column with a heading of its own
  // on the title's line is another block set beside this one.
  const kept = [first];
  let edge = Math.max(...first.map((r) => r.run.x + r.run.w));
  for (const cl of clusters.filter((c) => c[0].run.x > first[0].run.x + 3 && c.length >= 2)) {
    if (cl[0].run.x - edge > MAX_GUTTER * head.h) break;
    if (headLine.cells.some((c) => c !== head && Math.abs(c.x0 - cl[0].run.x) <= COLUMN_TOL)) break;
    if (Math.abs(Math.min(...cl.map((r) => r.line.y)) - firstLine) > 0.5 * head.h) continue;
    kept.push(cl);
    edge = Math.max(edge, ...cl.map((r) => r.run.x + r.run.w));
  }
  if (kept.length < 2 || kept.length > MAX_UNRULED_COLUMNS) return null;
  const anchors = kept.map((cl) => cl.reduce((s, r) => s + r.run.x, 0) / cl.length);
  const columnAt = (x: number) => {
    let best = -1;
    let dist = COLUMN_TOL + 0.5;
    anchors.forEach((a, i) => {
      if (Math.abs(a - x) < dist) {
        dist = Math.abs(a - x);
        best = i;
      }
    });
    return best;
  };
  const columnOf = (c: TextCell) => columnAt(c.x0);

  // A left token that sits close to the next column's text still starts its own cell.
  const lines = body.map((l) => ({ ...l, cells: cellsOfRuns(l.cells.flatMap((c) => c.runs), (t) => columnAt(t.x)) }));

  // Lines of the block, chained down from the title while the gaps stay small.
  const anchored = lines.filter((l) => l.cells.some((c) => columnOf(c) >= 0));
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(anchored.length, 8); i++) gaps.push(anchored[i].y - anchored[i - 1].y);
  const pitch = Math.min(...gaps.filter((g) => g > 0.6 * head.h), Infinity);
  if (!Number.isFinite(pitch)) return null;
  let block: TextLine[] = [];
  let prev = head.y;
  for (const l of anchored) {
    if (l.y - prev > 2.7 * pitch) break;
    block.push(l);
    prev = l.y;
  }
  // The first record opens with a token in the first column.
  const openAt = block.findIndex((l) => l.cells.some((c) => columnOf(c) === 0));
  block = openAt < 0 ? [] : block.slice(openAt);
  if (block.length < 3) return null;

  // Text inside the block's own span that lines up with no column means this is something else.
  const spanX0 = Math.min(...anchors) - 2;
  const spanX1 = Math.max(...block.flatMap((l) => l.cells.filter((c) => columnOf(c) >= 0).map((c) => c.x1))) + 2;
  const blockTop = block[0].y - block[0].h;
  const blockBottom = block[block.length - 1].y;
  let foreign = 0;
  let members = 0;
  for (const l of lines) {
    if (l.y < blockTop || l.y > blockBottom) continue;
    for (const c of l.cells) {
      if (c.x0 < spanX0 || c.x0 > spanX1) continue;
      if (columnOf(c) >= 0) members++;
      else foreign++;
    }
  }
  if (foreign > 0.2 * members) return null;

  // Records: a first-column token opens one. Where records are set apart by blank lines, tokens on
  // consecutive lines (a room name that wraps) belong to the same record.
  const spaced = block.some((l, i) => i > 0 && l.y - block[i - 1].y >= 1.6 * pitch);
  const records: TextLine[][] = [];
  block.forEach((l, i) => {
    const opens = l.cells.some((c) => columnOf(c) === 0);
    const prevOpens = i > 0 && block[i - 1].cells.some((c) => columnOf(c) === 0);
    const gap = i > 0 && l.y - block[i - 1].y >= 1.6 * pitch;
    if (records.length === 0 || (opens && (!prevOpens || gap || !spaced))) records.push([l]);
    else records[records.length - 1].push(l);
  });
  // One record is enough only for a finishes schedule: a single room, and the lines beneath its name.
  if (records.length < 2 && !/finish/i.test(head.text)) return null;
  const names = records.map((rec) => rec.flatMap((l) => l.cells.filter((c) => columnOf(c) === 0)).map((c) => c.text).join(" "));
  const lengths = names.map((n) => n.length).sort((p, q) => p - q);
  if (lengths[Math.floor(lengths.length / 2)] > 32) return null;
  // Numbers, letters and bullets down the left are a list of notes, not names of things.
  if (names.every((n) => /^(?:\d+|[a-z])?[.):]?$|^[-•·*]$/i.test(n))) return null;

  const cellsOut: TableCell[] = [];
  const ids: number[] = [];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  records.forEach((rec, row) => {
    for (let col = 0; col < anchors.length; col++) {
      const mine = rec.flatMap((l) => l.cells.filter((c) => columnOf(c) === col));
      for (const c of mine) {
        x0 = Math.min(x0, c.x0);
        x1 = Math.max(x1, c.x1);
        y0 = Math.min(y0, c.y - c.h);
        y1 = Math.max(y1, c.y);
        ids.push(...c.ids);
      }
      cellsOut.push({ row, col, text: mine.map((c) => c.text).join(" ").replace(/\s+/g, " ").trim(), textIds: mine.flatMap((c) => c.ids) });
    }
  });
  const table: Table = { box: roundBox([x0, y0, x1, y1]), rows: records.length, cols: anchors.length, cells: cellsOut, title: head.text, ruled: false };
  GEOMETRY.set(table, { rowH: [], up: [], full: roundBox([Math.min(x0, head.x0), Math.min(y0, head.y - head.h), Math.max(x1, head.x1), y1]) });
  return { table, ids: [...ids, ...head.ids] };
}

// ── 7. readTables ────────────────────────────────────────────────────────

/** Every table on the sheet: ruled grids from thin horizontal+vertical lines, plus unruled column-aligned text blocks. */
export function readTables(sheet: SheetRaw): Table[] {
  const refs = refsOf(sheet.text);
  const ruled = findRuledTables(sheet, refs);
  const boxes = ruled.map((t) => t.box);
  for (const t of ruled) {
    if (t.title) continue;
    t.title = headingAbove(t, sheet, refs, boxes.filter((b) => b !== t.box));
  }
  // Words in a ruled table, its title band included, are not free text.
  const unruled = findUnruledTables(sheet, ruled.map((t) => GEOMETRY.get(t)?.full ?? t.box));
  return [...ruled, ...unruled].sort((p, q) => p.box[1] - q.box[1] || p.box[0] - q.box[0]);
}

// ── 8. Schedules ─────────────────────────────────────────────────────────

const HEADER_WORDS = new Set(
  (
    "mark marks id element no number ref reference item tag drg dwg drawing sheet type size sizes width height depth length " +
    "quantity qty description remarks remark notes note name rev revision date status design location room space area orientation " +
    "sill head frame glazing glass material finish finishes colour color hardware handle lock fire rating opening dimensions dimension " +
    "thickness grade treatment spacing span section detail spec specification support unit units mm floor floors wall walls ceiling " +
    "joinery swing hand jamb cill lintel supplier code layout"
  ).split(" "),
);

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const tidy = (s: string) => normalise(s).replace(/[:;*]+$/, "").trim();

/** Made only of header words ("W x H Size", "Drg No."): a lone letter is a mark, not a header. */
function headerLike(text: string): boolean {
  const words = normalise(text).split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  return words.every((w) => HEADER_WORDS.has(w) || (words.length > 1 && /^[a-z]$/.test(w)));
}

/**
 * Header words that name the mark column, best first:
 *   id    "Mark", "Element ID", "Drg No." — the identifier itself
 *   noun  "Beam", "Window" — the column holds one of them per row
 *   name  "Room", "Location" — names, not identifiers
 *   weak  "Ref", "Type", "Item" — often a mark, sometimes a cross-reference
 */
const ID_HEADER = /^(?:(?:element|drg|dwg|drawing|sheet|door|window|opening|item)\s+)?(?:mark|marks|id|no\.?|number|tag)$|^(?:drg|dwg|drawing|sheet)\s+(?:no\.?|number|id)$/;
const NOUN_HEADER = /^(?:beam|column|post|wall|window|door|lintel|footing|slab|truss|rafter|bracket|opening|stair|brace|joist|bearer|pile)s?$/;
const NAME_HEADER = /^(?:room|room name|location|space|area|zone|name)$/;
const WEAK_HEADER = /^(?:ref\.?|reference|item|type)$/;

type MarkColumn = { index: number; tier: "id" | "noun" | "name" | "weak" };

function pickMark(labels: readonly string[]): MarkColumn | null {
  for (const [tier, re] of [
    ["id", ID_HEADER],
    ["noun", NOUN_HEADER],
    ["name", NAME_HEADER],
    ["weak", WEAK_HEADER],
  ] as const) {
    const index = labels.findIndex((l) => re.test(tidy(l)));
    if (index >= 0) return { index, tier };
  }
  return null;
}

const MARK_TOKEN = /^(?=[A-Za-z0-9./-]*\d)[A-Za-z0-9]{1,8}(?:[./-][A-Za-z0-9]{1,6})?$|^[A-Z]{1,3}$/;

/** The identifier(s) at the start of a mark cell: "D14 - 2/190x45 SG8" → "D14", "W1 & W2" as printed. */
function extractMark(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || headerLike(t)) return null;
  const parts = t.split(/\s*(?:&|,|\+|\band\b)\s*/i);
  if (parts.every((p) => MARK_TOKEN.test(p))) return t;
  const lead = t.split(/\s+[-–—:]\s+|\s*\(/)[0].trim();
  return lead && lead !== t && MARK_TOKEN.test(lead) ? lead : null;
}

const KIND_RULES: Array<[Exclude<ScheduleKind, "reference_standard" | "other">, RegExp]> = [
  ["drawing_list", /drawing (?:list|register|index|schedule)|sheet (?:list|index)|drg\.? no/i],
  ["finishes", /finish/i],
  ["windows", /window|glazing/i],
  ["doors", /door/i],
  ["lintels", /lintel/i],
  ["beams", /\bbeams?\b|joist|bearer/i],
  ["columns", /\bcolumns?\b|\bposts?\b/i],
  ["walls", /\bwalls?\b|\bstuds?\b/i],
  ["floors", /\bfloors?\b|slab|foundation|footing/i],
  ["fixings", /fixing|fastener|connector|bracket/i],
];

function kindOf(title: string | null, headers: readonly string[], marks: readonly string[]): ScheduleKind {
  for (const source of [title ?? "", headers.join(" ")]) {
    for (const [kind, re] of KIND_RULES) if (re.test(source)) return kind;
  }
  const w = marks.filter((m) => /^W\d/i.test(m)).length;
  const d = marks.filter((m) => /^D\d/i.test(m)).length;
  if (marks.length > 0 && w >= 0.7 * marks.length) return "windows";
  if (marks.length > 0 && d >= 0.7 * marks.length) return "doors";
  return "other";
}

// Pasted-in reference material: standards' span tables, manufacturers' tables.
const REF_CAPTION = /^\s*table\s+\d+(?:\.\d+)*\s*(?:[:.–—-]|\(|$)/i;
const REF_SOURCE = /©|\bcopyright\b|standards new zealand|standards australia|\bNZS\s?\d{3,4}|\bAS\/NZS\b|\bBRANZ\b/i;

/** Is this table pasted-in reference material? Judged by its own title and first row, and by the free text just above and below it. */
function isReference(table: Table, refs: readonly TextRef[], frames: readonly Box[]): boolean {
  const [x0, y0, x1, y1] = table.box;
  const around = refs.filter(
    (t) => isAcross(t.item) && t.cx >= x0 - 3 && t.cx <= x1 + 3 && t.cy >= y0 - MAX_HEADING_GAP && t.cy <= y1 + 10 && !frames.some((b) => inBox(b, t.cx, t.cy)),
  );
  const lines = orderedLines(around).map(joinRefs);
  if (table.title && (REF_CAPTION.test(table.title) || REF_SOURCE.test(table.title))) return true;
  if (lines.some((l) => REF_CAPTION.test(l) || REF_SOURCE.test(l))) return true;
  // A caption set into the table's own first row ("Table 11: Roofing spans…").
  return REF_CAPTION.test(table.cells.filter((c) => c.row === 0).map((c) => c.text).join(" "));
}

/** The big schedule title on the sheet ("Window Schedule" in the title block), outside any table. */
function sheetTitle(refs: readonly TextRef[], frames: readonly Box[]): string | null {
  const candidates = refs.filter(
    (t) => isAcross(t.item) && t.item.h >= 3 && t.item.s.length <= 60 && /\b(?:schedule|schedules|list|register)\b/i.test(t.item.s) && !frames.some((b) => inBox(b, t.cx, t.cy)),
  );
  candidates.sort((p, q) => q.item.h - p.item.h || q.item.y - p.item.y);
  return candidates[0]?.item.s ?? null;
}

type Matrix = { text: string[][]; ids: number[][][] };

function matrixOf(table: Table): Matrix {
  const text = Array.from({ length: table.rows }, () => Array<string>(table.cols).fill(""));
  const ids = Array.from({ length: table.rows }, () => Array.from({ length: table.cols }, () => [] as number[]));
  for (const c of table.cells) {
    text[c.row][c.col] = c.text;
    ids[c.row][c.col] = c.textIds;
  }
  return { text, ids };
}

/** Header text → unique field key. */
function keysOf(labels: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return labels.map((raw, i) => {
    const base = normalise(raw) || `column ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} ${n}`;
  });
}

const uniqueSorted = (ids: readonly number[]) => [...new Set(ids)].sort((p, q) => p - q);

type Read = { headers: string[]; records: ScheduleRecord[]; transposed: boolean };

/** Rows much taller than the table's own rows hold a drawing (a plan, an elevation), not values. */
function pictureRows(table: Table): boolean[] {
  const heights = GEOMETRY.get(table)?.rowH ?? [];
  if (heights.length === 0) return Array<boolean>(table.rows).fill(false);
  const median = [...heights].sort((p, q) => p - q)[Math.floor(heights.length / 2)];
  return heights.map((h) => h >= Math.max(12, 4 * median));
}

/** A cell's words, minus the drawing's own dimension numbers when the row is a picture. */
function valueOf(text: string, picture: boolean): string {
  return picture && !/[A-Za-z]/.test(text) ? "" : text;
}

/** The header row among the table's first rows, and the column holding its marks. */
function findHeader(m: Matrix, namedOk: boolean): { row: number; pick: MarkColumn } | null {
  let seen = 0;
  for (let r = 0; r < m.text.length && seen < 3; r++) {
    const filled = m.text[r].filter(Boolean);
    if (filled.length === 0) continue;
    seen++;
    const share = filled.filter(headerLike).length / filled.length;
    const pick = filled.length >= 2 ? pickMark(m.text[r]) : null;
    if (pick && (pick.tier === "id" || (share >= 0.5 && (pick.tier !== "name" || namedOk)))) return { row: r, pick };
    // A header row whose first cell is blank, above a column of marks.
    const marksBelow = m.text.slice(r + 1).filter((row) => row[0] && extractMark(row[0])).length;
    if (!m.text[r][0] && filled.length >= 2 && share >= 0.6 && marksBelow >= 2) return { row: r, pick: { index: 0, tier: "id" } };
  }
  return null;
}

function readRows(table: Table, m: Matrix, keyedOk: boolean, namedOk: boolean): Read | null {
  const top = m.text.findIndex((row) => row.some(Boolean));
  if (top < 0) return null;
  const headed = findHeader(m, namedOk);
  const geo = GEOMETRY.get(table);
  const picture = pictureRows(table);

  let markCol: number;
  let start: number;
  let keys: string[];
  let named = false;
  if (headed) {
    markCol = headed.pick.index;
    start = headed.row + 1;
    keys = keysOf(m.text[headed.row]);
    named = headed.pick.tier === "name";
  } else if (keyedOk) {
    // No header row, but a titled table whose first column is all marks: "Post Table: P4 | 3 H3.2 studs".
    const firsts = m.text.map((row) => row[0]).filter(Boolean);
    if (firsts.length < 2 || firsts.some((f) => !extractMark(f))) return null;
    markCol = 0;
    start = top;
    keys = keysOf(["mark", ...Array.from({ length: table.cols - 1 }, (_, i) => `column ${i + 2}`)]);
  } else return null;

  const records: ScheduleRecord[] = [];
  for (let r = start; r < m.text.length; r++) {
    const cell = m.text[r][markCol];
    const id = named ? (cell && cell.length <= 60 && !headerLike(cell) ? cell : null) : extractMark(cell);
    if (!id) {
      // A mark cell merged with the row above: this row carries on the record above it.
      const last = records[records.length - 1];
      if (!cell && last && geo?.up[r]?.[markCol]) {
        m.text[r].forEach((t, c) => {
          const v = valueOf(t, picture[r]);
          if (!v || c === markCol) return;
          last.fields[keys[c]] = last.fields[keys[c]] ? `${last.fields[keys[c]]}\n${v}` : v;
        });
        last.textIds = uniqueSorted([...last.textIds, ...m.ids[r].flat()]);
      }
      continue;
    }
    const fields: Record<string, string> = {};
    m.text[r].forEach((t, c) => {
      const v = valueOf(t, picture[r]);
      if (v) fields[keys[c]] = v;
    });
    records.push({ mark: id, fields, textIds: uniqueSorted(m.ids[r].flat()) });
  }
  return records.length > 0 ? { headers: keys, records, transposed: false } : null;
}

function readColumns(table: Table, m: Matrix): Read[] {
  // Field names run down the first column; each further column is one record.
  const labels = m.text.map((row) => row[0]);
  const filled = labels.filter(Boolean);
  if (filled.length < 2) return [];
  const head = filled.filter(headerLike);
  if (head.length < 2 || head.length < 0.5 * filled.length) return [];
  // Blocks start wherever the mark row's label comes round again (tables sharing one grid).
  let markRows = labels.map((l, r) => (ID_HEADER.test(tidy(l)) || NOUN_HEADER.test(tidy(l)) ? r : -1)).filter((r) => r >= 0);
  if (markRows.length === 0) {
    // A blank corner: the first row that is all marks, with nothing in front of it.
    const blank = m.text.findIndex((row) => !row[0] && row.slice(1).filter((c) => extractMark(c)).length >= 2);
    if (blank < 0 || blank > 2) return [];
    markRows = [blank];
  }
  const picture = pictureRows(table);
  const reads: Read[] = [];
  markRows.forEach((markRow, b) => {
    const end = b + 1 < markRows.length ? markRows[b + 1] : m.text.length;
    // Most of the row's cells must be marks, or this is a header row read sideways.
    const cellsOfRow = m.text[markRow].slice(1).filter(Boolean);
    if (cellsOfRow.filter((c) => extractMark(c)).length < 0.6 * cellsOfRow.length) return;
    const rows = Array.from({ length: end - markRow }, (_, i) => markRow + i);
    const keys = keysOf(rows.map((r) => labels[r]));
    const records: ScheduleRecord[] = [];
    for (let c = 1; c < m.text[markRow].length; c++) {
      const id = extractMark(m.text[markRow][c]);
      if (!id) continue;
      const fields: Record<string, string> = {};
      const ids: number[] = [];
      rows.forEach((r, i) => {
        const v = valueOf(m.text[r][c], picture[r]);
        if (v) fields[keys[i]] = v;
        ids.push(...m.ids[r][c]);
      });
      records.push({ mark: id, fields, textIds: uniqueSorted(ids) });
    }
    if (records.length > 0) reads.push({ headers: keys, records, transposed: true });
  });
  return reads;
}

/**
 * Unruled finishes: the room name is the mark ("beds wr" when the name runs over two lines), and every
 * printed line is kept on its own line in its field ("room" too, so a wrapped name can be split again).
 */
function readFinishes(table: Table, sheet: SheetRaw): Read | null {
  const m = matrixOf(table);
  const byId = new Map(sheet.text.map((t) => [t.id, t]));
  const keys = ["room", ...Array.from({ length: table.cols - 1 }, (_, i) => (table.cols === 2 ? "finishes" : `column ${i + 2}`))];
  const linesOf = (ids: readonly number[]) =>
    orderedLines(refsOf(ids.map((id) => byId.get(id)).filter((t): t is TextItem => !!t)))
      .map((l) => l.map((t) => t.item.s).join(" "))
      .join("\n");
  const records: ScheduleRecord[] = [];
  for (let r = 0; r < table.rows; r++) {
    const room = m.text[r][0];
    if (!room) continue;
    const fields: Record<string, string> = {};
    for (let c = 0; c < table.cols; c++) {
      const text = linesOf(m.ids[r][c]);
      if (text) fields[keys[c]] = text;
    }
    records.push({ mark: room, fields, textIds: uniqueSorted(m.ids[r].flat()) });
  }
  return records.length > 0 ? { headers: keys, records, transposed: false } : null;
}

/** Tables that are schedules: records keyed by their mark (W01, D12, G49h, S1, room name for finishes). */
export function readSchedules(sheet: SheetRaw): Schedule[] {
  const tables = readTables(sheet);
  const refs = refsOf(sheet.text);
  const frames = tables.map((t) => GEOMETRY.get(t)?.full ?? t.box);
  const fallback = sheetTitle(refs, frames);
  const out: Schedule[] = [];
  for (const table of tables) {
    const title = table.title ?? fallback;
    const base = { title, page: sheet.page, box: table.box };
    if (isReference(table, refs, frames)) {
      // The sheet's own schedule title says nothing about a table pasted onto it.
      out.push({ ...base, title: table.title, kind: "reference_standard", headers: [], records: [], transposed: false });
      continue;
    }
    let reads: Read[];
    if (!table.ruled && /finish/i.test(title ?? "")) {
      const read = readFinishes(table, sheet);
      reads = read ? [read] : [];
    } else {
      const m = matrixOf(table);
      const rowWise = readRows(table, m, /table|schedule|list/i.test(table.title ?? ""), /finish|room|schedule/i.test(title ?? ""));
      const colWise = readColumns(table, m);
      // Whichever direction reads more marks wins; ties go to the header row.
      const columns = colWise.reduce((n, r) => n + r.records.length, 0);
      reads = rowWise && rowWise.records.length >= columns ? [rowWise] : colWise;
    }
    for (const read of reads) {
      // A lone row under no title is a form field or a title-block cell, not a schedule.
      if (read.records.length < 2 && !title) continue;
      const kind = kindOf(title, read.headers, read.records.map((r) => r.mark));
      out.push({ ...base, kind, headers: read.headers, records: read.records, transposed: read.transposed });
    }
  }
  return out;
}
