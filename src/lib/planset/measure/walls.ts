// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — walls from the drawing's filled shapes (pure).
//
// CAD floor plans draw each wall's framing as a filled strip (on the owner's
// new-house set: dark strips exactly 90 mm thick at 1:100). With the sheet's
// PROVEN scale those strips give real wall lengths and thicknesses:
//
//   1. pieces   — axis-aligned filled rectangles of wall thickness;
//   2. lines    — pieces on one line joined, gaps between them kept as
//                 opening candidates (a window or door breaks the fill);
//   3. outside  — a flood fill from the page edge, with the gaps closed,
//                 marks which walls face the outside and gives the floor
//                 area enclosed by the outside face of the framing.
//
// No scale proof → this module is never called (the SCALE gate).
// ─────────────────────────────────────────────────────────────────────────

import type { FillShape } from "../types";

export type WallPiece = {
  id: number;
  orientation: "h" | "v";
  /** Page-mm box. */
  box: [number, number, number, number];
  thicknessMm: number;
  lengthMm: number;
  colour: string;
};

export type WallGap = {
  /** Along the line, page mm. */
  from: number;
  to: number;
  widthMm: number;
};

export type WallLine = {
  id: number;
  orientation: "h" | "v";
  /** Centre line: y of a horizontal wall, x of a vertical one (page mm). */
  at: number;
  from: number;
  to: number;
  thicknessMm: number;
  colour: string;
  pieceIds: number[];
  gaps: WallGap[];
  /** End to end, openings included (the framing run). */
  lengthMm: number;
  external: boolean;
};

export type WallReadout = {
  pieces: WallPiece[];
  lines: WallLine[];
  externalLengthMm: number;
  internalLengthMm: number;
  /** Floor area inside the outside face of the external walls (m²), null if no closed outline. */
  enclosedAreaM2: number | null;
  /** Page-mm box around every wall. */
  extent: [number, number, number, number] | null;
};

export type WallOptions = {
  /** Real mm per page mm (the proven scale). */
  ratio: number;
  /** Only read shapes inside this page-mm box (the plan's viewport). */
  region?: [number, number, number, number];
  /** Wall thickness band, real mm. */
  minThicknessMm?: number;
  maxThicknessMm?: number;
  /** Largest gap in a wall line read as an opening, real mm. */
  maxOpeningMm?: number;
};

/** Read the walls on one floor-plan viewport. */
export function readWalls(fills: readonly FillShape[], opts: WallOptions): WallReadout {
  const minT = opts.minThicknessMm ?? 60;
  const maxT = opts.maxThicknessMm ?? 400;
  const maxGap = opts.maxOpeningMm ?? 6000;
  const k = opts.ratio;
  const pieces: WallPiece[] = [];
  for (const f of fills) {
    if (!isRectangle(f)) continue;
    const [x0, y0, x1, y1] = f.bbox;
    if (opts.region && !inside([x0, y0, x1, y1], opts.region)) continue;
    const w = (x1 - x0) * k, h = (y1 - y0) * k;
    const thickness = Math.min(w, h), length = Math.max(w, h);
    if (thickness < minT || thickness > maxT || length < thickness * 1.5) continue;
    pieces.push({
      id: pieces.length,
      orientation: w >= h ? "h" : "v",
      box: f.bbox,
      thicknessMm: Math.round(thickness),
      lengthMm: Math.round(length),
      colour: f.c,
    });
  }
  const allLines = joinPieces(pieces, k, maxGap);
  const lines = largestGroup(allLines, k);
  if (!lines.length) return { pieces: [], lines: [], externalLengthMm: 0, internalLengthMm: 0, enclosedAreaM2: null, extent: null };
  // Keep only the building's pieces, renumbered, and point the lines at the new ids.
  const keep = new Map<number, number>();
  const kept: WallPiece[] = [];
  for (const l of lines) for (const id of l.pieceIds) {
    if (!keep.has(id)) {
      keep.set(id, kept.length);
      kept.push({ ...pieces[id], id: kept.length });
    }
  }
  lines.forEach((l, i) => {
    l.id = i;
    l.pieceIds = l.pieceIds.map((id) => keep.get(id)!);
  });
  pieces.length = 0;
  pieces.push(...kept);
  const extent: [number, number, number, number] = [
    Math.min(...pieces.map((p) => p.box[0])),
    Math.min(...pieces.map((p) => p.box[1])),
    Math.max(...pieces.map((p) => p.box[2])),
    Math.max(...pieces.map((p) => p.box[3])),
  ];
  const outside = floodOutside(pieces, lines, extent, k);
  for (const l of lines) l.external = outside.touches(l);
  const externalLengthMm = lines.filter((l) => l.external).reduce((s, l) => s + l.lengthMm, 0);
  const internalLengthMm = lines.filter((l) => !l.external).reduce((s, l) => s + l.lengthMm, 0);
  return { pieces, lines, externalLengthMm, internalLengthMm, enclosedAreaM2: outside.enclosedAreaM2, extent };
}

/**
 * The building is the biggest group of wall LINES that meet (within half a
 * metre — walls at a junction touch). Lines already bridge their own
 * openings, so a wide slider or garage door doesn't split the house.
 * Title-block frames and legend swatches are separate groups and drop out.
 */
function largestGroup(lines: WallLine[], k: number): WallLine[] {
  if (lines.length <= 1) return lines;
  const reach = 500 / k;
  const box = (l: WallLine): [number, number, number, number] => {
    const half = l.thicknessMm / k / 2;
    return l.orientation === "h" ? [l.from, l.at - half, l.to, l.at + half] : [l.at - half, l.from, l.at + half, l.to];
  };
  const boxes = lines.map(box);
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = boxes[i], b = boxes[j];
      const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
      const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
      if (Math.hypot(dx, dy) <= reach) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, WallLine[]>();
  lines.forEach((l, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(l);
    else groups.set(root, [l]);
  });
  // A building has dozens of wall lines; a sheet frame has a handful of very
  // long ones. Count lines first, length only to break ties.
  let best: WallLine[] = [];
  let bestLength = 0;
  for (const g of groups.values()) {
    const length = g.reduce((s, l) => s + l.lengthMm, 0);
    if (g.length > best.length || (g.length === best.length && length > bestLength)) {
      best = g;
      bestLength = length;
    }
  }
  return best;
}

/** A filled shape whose outline is (close to) an axis-aligned rectangle. */
function isRectangle(f: FillShape): boolean {
  const pts = f.pts;
  if (pts.length < 4 || pts.length > 6) return false;
  const [x0, y0, x1, y1] = f.bbox;
  const tol = 0.02;
  return pts.every(([x, y]) => (Math.abs(x - x0) <= tol || Math.abs(x - x1) <= tol) && (Math.abs(y - y0) <= tol || Math.abs(y - y1) <= tol));
}

function inside(b: [number, number, number, number], r: [number, number, number, number]): boolean {
  return b[0] >= r[0] && b[1] >= r[1] && b[2] <= r[2] && b[3] <= r[3];
}

/** Collinear pieces of the same thickness become one line; gaps up to maxGap are openings. */
function joinPieces(pieces: WallPiece[], k: number, maxGapMm: number): WallLine[] {
  const lines: WallLine[] = [];
  for (const o of ["h", "v"] as const) {
    const group = pieces
      .filter((p) => p.orientation === o)
      .map((p) => ({
        p,
        at: o === "h" ? (p.box[1] + p.box[3]) / 2 : (p.box[0] + p.box[2]) / 2,
        a: o === "h" ? p.box[0] : p.box[1],
        b: o === "h" ? p.box[2] : p.box[3],
      }))
      .sort((x, y) => x.at - y.at || x.a - y.a);
    const rows: (typeof group)[] = [];
    for (const g of group) {
      const row = rows.find((r) => Math.abs(r[0].at - g.at) <= 0.15 && Math.abs(r[0].p.thicknessMm - g.p.thicknessMm) <= 15);
      if (row) row.push(g);
      else rows.push([g]);
    }
    for (const row of rows) {
      row.sort((x, y) => x.a - y.a);
      let cur: WallLine | null = null;
      for (const g of row) {
        if (cur && g.a - cur.to <= maxGapMm / k) {
          if (g.a > cur.to + 0.05) cur.gaps.push({ from: cur.to, to: g.a, widthMm: Math.round((g.a - cur.to) * k) });
          cur.to = Math.max(cur.to, g.b);
          cur.pieceIds.push(g.p.id);
        } else {
          if (cur) lines.push(cur);
          cur = { id: 0, orientation: o, at: g.at, from: g.a, to: g.b, thicknessMm: g.p.thicknessMm, colour: g.p.colour, pieceIds: [g.p.id], gaps: [], lengthMm: 0, external: false };
        }
      }
      if (cur) lines.push(cur);
    }
  }
  lines.forEach((l, i) => {
    l.id = i;
    l.lengthMm = Math.round((l.to - l.from) * k);
  });
  return lines;
}

/**
 * Rasterise the walls (gaps closed) at ~20 mm real, flood-fill from outside.
 * External walls touch the outside; the enclosed area is everything the
 * flood can't reach — rooms plus the walls themselves, i.e. the area inside
 * the outside face of the framing.
 */
function floodOutside(
  pieces: WallPiece[],
  lines: WallLine[],
  extent: [number, number, number, number],
  k: number,
): { touches: (l: WallLine) => boolean; enclosedAreaM2: number | null } {
  const cellMm = 20; // real mm
  const cellPage = cellMm / k;
  const pad = 3;
  const cols = Math.ceil((extent[2] - extent[0]) / cellPage) + pad * 2;
  const rows = Math.ceil((extent[3] - extent[1]) / cellPage) + pad * 2;
  if (cols * rows > 12_000_000) return { touches: () => false, enclosedAreaM2: null };
  const WALL = 1, OUT = 2;
  const grid = new Uint8Array(cols * rows);
  const toCol = (x: number) => Math.floor((x - extent[0]) / cellPage) + pad;
  const toRow = (y: number) => Math.floor((y - extent[1]) / cellPage) + pad;
  // Paint the cells whose CENTRE lies in the box, so the area isn't biased
  // outward by a cell all round (≈1.4 m² on a house).
  const paint = (x0: number, y0: number, x1: number, y1: number) => {
    const c0 = Math.ceil((x0 - extent[0]) / cellPage - 0.5) + pad, c1 = Math.floor((x1 - extent[0]) / cellPage - 0.5) + pad;
    const r0 = Math.ceil((y0 - extent[1]) / cellPage - 0.5) + pad, r1 = Math.floor((y1 - extent[1]) / cellPage - 0.5) + pad;
    for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(cols - 1, c1); c++) {
      grid[r * cols + c] = WALL;
    }
  };
  for (const p of pieces) paint(...p.box);
  // Close the openings so the flood doesn't pour in through doors and windows
  // (a cell of overlap each end so the plug always meets the wall).
  for (const l of lines) {
    const half = l.thicknessMm / k / 2;
    for (const g of l.gaps) {
      if (l.orientation === "h") paint(g.from - cellPage, l.at - half, g.to + cellPage, l.at + half);
      else paint(l.at - half, g.from - cellPage, l.at + half, g.to + cellPage);
    }
  }
  const stack: number[] = [0];
  grid[0] = OUT;
  while (stack.length) {
    const i = stack.pop()!;
    const r = (i / cols) | 0, c = i % cols;
    const next = [r > 0 ? i - cols : -1, r < rows - 1 ? i + cols : -1, c > 0 ? i - 1 : -1, c < cols - 1 ? i + 1 : -1];
    for (const n of next) {
      if (n >= 0 && grid[n] === 0) {
        grid[n] = OUT;
        stack.push(n);
      }
    }
  }
  let enclosed = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] !== OUT) enclosed++;
  const touches = (l: WallLine) => {
    // Sample just outside both faces along the line; outside on either face → external.
    const half = l.thicknessMm / k / 2 + cellPage * 1.5;
    const steps = Math.max(4, Math.ceil((l.to - l.from) / cellPage / 4));
    let hits = 0, samples = 0;
    for (let s = 0; s <= steps; s++) {
      const t = l.from + ((l.to - l.from) * s) / steps;
      for (const side of [-1, 1]) {
        const [x, y] = l.orientation === "h" ? [t, l.at + side * half] : [l.at + side * half, t];
        const r = toRow(y), c = toCol(x);
        if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
        samples++;
        if (grid[r * cols + c] === OUT) hits++;
      }
    }
    // More than a quarter of the samples on one face outside → it's an outside wall.
    return samples > 0 && hits / samples > 0.25;
  };
  const areaM2 = (enclosed * cellMm * cellMm) / 1e6;
  return { touches, enclosedAreaM2: enclosed > 0 ? Math.round(areaM2 * 10) / 10 : null };
}
