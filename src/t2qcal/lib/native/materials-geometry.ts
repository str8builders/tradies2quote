/**
 * Geometry helpers used by the materials calculators, ported line by line from
 * the native app:
 *   Models/BoardRun.swift, Models/SheetCutLayout.swift,
 *   Models/WeatherboardLayout.swift, Models/TimberGeometry.swift,
 *   Models/PaintCoverage.swift, Models/CircularPavingLayout.swift,
 *   Models/WallpaperLayout.swift and Models/ToolHandoff.swift.
 *
 * Nothing here formats for display beyond the cut list, which the native
 * SheetCutLayout also builds through `Fmt`.
 */

import { ceilInt, floorInt, len, swiftRound, ulp } from "./format";

const finite = (values: number[]) => values.every((value) => Number.isFinite(value));

// MARK: BoardRun

/** A closed run of full-width interior pieces, equal edge cuts and fixed joints. */
export type BoardRun = {
  span: number;
  stockWidth: number;
  gap: number;
  count: number;
  edge: number;
};

export function boardRun(span: number, stockWidth: number, gap: number): BoardRun | null {
  if (!finite([span, stockWidth, gap]) || !(span > 0) || !(stockWidth > 0) || !(gap >= 0)) return null;
  const required = (span + gap) / (stockWidth + gap);
  if (!(required <= 10_000)) return null;
  const count = ceilInt(required, 1, 10_000);
  const edge = count === 1 ? span : (span - (count - 2) * stockWidth - (count - 1) * gap) / 2;
  if (!(edge > 0) || !(edge <= stockWidth + ulp(span) * 8)) return null;
  return { span, stockWidth, gap, count, edge };
}

export const BOARD_RUN_INVALID =
  "The entered width and gaps must leave positive edge cuts within the stock width. Reduce the gap or change the stock width. A run supports up to 10,000 pieces.";

// MARK: SheetCutLayout

export type SheetPiece = { id: number; x: number; y: number; width: number; height: number };
export type SheetCut = {
  piece: number; stock: number; x: number; y: number; width: number; height: number; rotated: boolean;
};
type FreeRect = { stock: number; x: number; y: number; width: number; height: number };

export type SheetCutLayout = {
  length: number; height: number; stockLength: number; stockWidth: number; kerf: number;
  pieces: SheetPiece[]; cuts: SheetCut[]; stockCount: number; across: number; up: number; turned: boolean;
};

export const SHEET_CUT_INVALID =
  "Use positive covering and stock dimensions, and a layout of no more than 10,000 cut pieces. Split larger jobs into sections.";

function sheetCutLayout(
  length: number, height: number, stockLength: number, stockWidth: number, kerf: number, turned: boolean,
): SheetCutLayout | null {
  if (!finite([length, height, stockLength, stockWidth, kerf])) return null;
  if (!(Math.min(length, height, stockLength, stockWidth) > 0) || !(kerf >= 0)) return null;
  const coverX = turned ? stockWidth : stockLength;
  const coverY = turned ? stockLength : stockWidth;
  const nx = ceilInt(length / coverX, 1, 10_001);
  const ny = ceilInt(height / coverY, 1, 10_001);
  if (!(nx * ny <= 10_000)) return null;

  const pieces: SheetPiece[] = [];
  for (let row = 0; row < ny; row += 1) {
    for (let col = 0; col < nx; col += 1) {
      pieces.push({
        id: pieces.length, x: col * coverX, y: row * coverY,
        width: Math.min(coverX, length - col * coverX),
        height: Math.min(coverY, height - row * coverY),
      });
    }
  }

  const free: FreeRect[] = [];
  const cuts: SheetCut[] = [];
  let stockCount = 0;
  const tolerance = ulp(Math.max(stockLength, stockWidth)) * 16;

  const ordered = [...pieces].sort((first, second) => {
    const a = first.width * first.height;
    const b = second.width * second.height;
    if (Math.abs(a - b) > ulp(Math.max(a, b)) * 16) return a > b ? -1 : 1;
    return first.id - second.id;
  });

  for (const piece of ordered) {
    const best = { index: -1, rotated: false, short: Infinity, long: Infinity };
    const consider = (rect: FreeRect, index: number, rotated: boolean) => {
      const w = rotated ? piece.height : piece.width;
      const h = rotated ? piece.width : piece.height;
      if (!(w <= rect.width + tolerance) || !(h <= rect.height + tolerance)) return;
      const short = Math.min(rect.width - w, rect.height - h);
      const long = Math.max(rect.width - w, rect.height - h);
      if (short < best.short - tolerance
        || (Math.abs(short - best.short) <= tolerance && long < best.long - tolerance)) {
        best.index = index; best.rotated = rotated; best.short = short; best.long = long;
      }
    };
    free.forEach((rect, index) => { consider(rect, index, false); consider(rect, index, true); });
    if (best.index < 0) {
      free.push({ stock: stockCount, x: 0, y: 0, width: stockLength, height: stockWidth });
      stockCount += 1;
      consider(free[free.length - 1], free.length - 1, false);
      consider(free[free.length - 1], free.length - 1, true);
    }
    if (best.index < 0) return null;
    const rect = free.splice(best.index, 1)[0];
    const w = best.rotated ? piece.height : piece.width;
    const h = best.rotated ? piece.width : piece.height;
    cuts.push({ piece: piece.id, stock: rect.stock, x: rect.x, y: rect.y, width: w, height: h, rotated: best.rotated });
    const rw = Math.max(0, rect.width - w - kerf);
    const rh = Math.max(0, rect.height - h - kerf);
    // Choose a straight first cut that leaves the larger intact offcut.
    const vertical = Math.max(rw * rect.height, w * rh);
    const horizontal = Math.max(rw * h, rect.width * rh);
    if (vertical >= horizontal) {
      if (rw > tolerance) free.push({ stock: rect.stock, x: rect.x + w + kerf, y: rect.y, width: rw, height: rect.height });
      if (rh > tolerance) free.push({ stock: rect.stock, x: rect.x, y: rect.y + h + kerf, width: w, height: rh });
    } else {
      if (rw > tolerance) free.push({ stock: rect.stock, x: rect.x + w + kerf, y: rect.y, width: rw, height: h });
      if (rh > tolerance) free.push({ stock: rect.stock, x: rect.x, y: rect.y + h + kerf, width: rect.width, height: rh });
    }
  }

  return { length, height, stockLength, stockWidth, kerf, pieces, cuts, stockCount, across: nx, up: ny, turned };
}

export function bestSheetCutLayout(
  length: number, height: number, stockLength: number, stockWidth: number, kerf = 0,
): SheetCutLayout | null {
  const candidates = [false, true]
    .map((turned) => sheetCutLayout(length, height, stockLength, stockWidth, kerf, turned))
    .filter((layout): layout is SheetCutLayout => layout !== null);
  if (candidates.length === 0) return null;
  const increasing = (a: SheetCutLayout, b: SheetCutLayout) => {
    if (a.stockCount !== b.stockCount) return a.stockCount < b.stockCount;
    if (a.pieces.length !== b.pieces.length) return a.pieces.length < b.pieces.length;
    return !a.turned && b.turned;
  };
  // Swift `min(by:)` keeps the earlier element unless a later one compares smaller.
  let result = candidates[0];
  for (const candidate of candidates.slice(1)) if (increasing(candidate, result)) result = candidate;
  return result;
}

export function sheetDiagramValues(layout: SheetCutLayout): Record<string, number> {
  return {
    coverLayout: 1, coverLength: layout.length, coverHeight: layout.height,
    stockLength: layout.stockLength, stockWidth: layout.stockWidth, cutKerf: layout.kerf,
    turned: layout.turned ? 1 : 0, stockCount: layout.stockCount,
  };
}

export function sheetCutList(layout: SheetCutLayout, metric: boolean): string[] {
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const piece of layout.pieces) {
    const label = `${len(piece.width, metric)} × ${len(piece.height, metric)}`;
    if (!counts.has(label)) order.push(label);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return order.map((label) => `${counts.get(label)} × ${label}`);
}

// MARK: WeatherboardLayout

export type WeatherboardLayout = {
  length: number; height: number; boardWidth: number; minimumOverlap: number; courses: number;
  cover: number; overlap: number; grossLineal: number;
  top: (course: number) => number;
  bottom: (course: number) => number;
};

export function weatherboardLayout(
  length: number, height: number, boardWidth: number, minimumOverlap: number,
): WeatherboardLayout | null {
  if (!finite([length, height, boardWidth, minimumOverlap])) return null;
  if (!(Math.min(length, height, boardWidth) > 0) || !(minimumOverlap >= 0) || !(minimumOverlap < boardWidth)) return null;
  const needed = height / (boardWidth - minimumOverlap);
  if (!Number.isFinite(needed) || !(needed <= 10_000 + 8 * ulp(10_000))) return null;
  const courses = ceilInt(needed, 1, 10_000);
  const cover = height / courses;
  const top = (course: number) => (course + 1) * cover;
  return {
    length, height, boardWidth, minimumOverlap, courses, cover,
    overlap: boardWidth - cover, grossLineal: length * courses,
    top, bottom: (course: number) => top(course) - boardWidth,
  };
}

// MARK: TimberGeometry

export type TimberGeometry = { length: number; width: number; depth: number; count: number };

export function timberGeometry(
  length: number, width: number, depth: number, count: number,
): TimberGeometry | null {
  if (!finite([length, width, depth])) return null;
  if (!(Math.min(length, width, depth) > 0) || !(count >= 1 && count <= 1000)) return null;
  if (!Number.isFinite(length * width * depth * count)) return null;
  if (!Number.isFinite(count * Math.max(width, depth) * 1.15)) return null;
  return { length, width, depth, count };
}

export function timberDiagramValues(g: TimberGeometry): Record<string, number> {
  return {
    timberGeometry: 1, pieceLength: g.length, sectionWidth: g.width,
    sectionDepth: g.depth, pieceCount: g.count,
  };
}

// MARK: PaintCoverage

export type PaintCoverage = {
  grossArea: number; openingArea: number; coats: number; coverage: number; allowance: number;
  canLitres: number; netArea: number; cans: number;
  theoreticalLitres: number; requiredLitres: number; purchasedLitres: number; surplusLitres: number;
};

export function paintCoverage(
  grossArea: number, openingArea: number, coats: number,
  coverage: number, allowance: number, canLitres: number,
): PaintCoverage | null {
  if (!finite([grossArea, openingArea, coverage, allowance, canLitres])) return null;
  if (!(grossArea > 0) || !(openingArea >= 0) || !(coverage > 0) || !(canLitres > 0)) return null;
  if (!(coats >= 1 && coats <= 6) || !(allowance >= 0 && allowance <= 100)) return null;
  const difference = grossArea - openingArea;
  const tolerance = Math.max(ulp(grossArea), ulp(openingArea)) * 8;
  if (!(difference >= -tolerance)) return null;
  const net = Math.abs(difference) <= tolerance ? 0 : difference;
  const needed = ((net * coats) / coverage) * (1 + allowance / 100);
  const count = needed / canLitres;
  if (!Number.isFinite(needed) || !Number.isFinite(count) || !(count <= 1_000_000_000)) return null;
  const cans = ceilInt(count, 0, 1_000_000_000);
  const theoreticalLitres = (net * coats) / coverage;
  const requiredLitres = theoreticalLitres * (1 + allowance / 100);
  const purchasedLitres = cans * canLitres;
  return {
    grossArea, openingArea: grossArea - net, coats, coverage, allowance, canLitres,
    netArea: net, cans, theoreticalLitres, requiredLitres, purchasedLitres,
    surplusLitres: Math.max(0, purchasedLitres - requiredLitres),
  };
}

// MARK: CircularPavingLayout

export type PavingPiece = { row: number; column: number; x: number; y: number; full: boolean };
export type CircularPavingLayout = {
  diameter: number; length: number; width: number; thickness: number; joint: number;
  halfBond: boolean; jointCentred: boolean; pieces: PavingPiece[]; fullCount: number; edgeCount: number;
};

export function circularPavingLayout(
  diameter: number, length: number, width: number, thickness: number,
  joint: number, halfBond: boolean, jointCentred: boolean,
): CircularPavingLayout | null {
  if (!finite([diameter, length, width, thickness, joint])) return null;
  if (!(Math.min(diameter, length, width, thickness) > 0) || !(joint >= 0) || !(joint < Math.min(length, width))) return null;
  const r = diameter / 2;
  const px = length + joint;
  const py = width + joint;
  const yShift = jointCentred ? py / 2 : 0;
  const rows = Math.ceil((r + width / 2 + yShift) / py);
  if (!(rows <= 10_000)) return null;
  const pieces: PavingPiece[] = [];
  const tolerance = ulp(r) * 16;
  const limit = Math.trunc(rows);
  for (let row = -limit; row <= limit; row += 1) {
    const y = row * py + yShift;
    const nearY = Math.max(0, Math.abs(y) - width / 2);
    if (!(nearY < r - tolerance)) continue;
    const reach = Math.sqrt(Math.max(0, (r - nearY) * (r + nearY)));
    const xShift = (jointCentred ? px / 2 : 0) + (halfBond && row % 2 !== 0 ? px / 2 : 0);
    const first = Math.ceil((-reach - length / 2 - xShift) / px);
    const last = Math.floor((reach + length / 2 - xShift) / px);
    if (!(last - first < 10_002)) return null;
    if (first > last) continue;
    for (let column = Math.trunc(first); column <= Math.trunc(last); column += 1) {
      const x = column * px + xShift;
      const nearX = Math.max(0, Math.abs(x) - length / 2);
      // Tangency has zero paving area. Snap only floating-point noise.
      if (!(Math.hypot(nearX, nearY) < r - tolerance)) continue;
      const full = Math.hypot(Math.abs(x) + length / 2, Math.abs(y) + width / 2) <= r + tolerance;
      pieces.push({ row, column, x, y, full });
      if (!(pieces.length <= 10_000)) return null;
    }
  }
  if (pieces.length === 0) return null;
  const fullCount = pieces.filter((piece) => piece.full).length;
  return {
    diameter, length, width, thickness, joint, halfBond, jointCentred, pieces,
    fullCount, edgeCount: pieces.length - fullCount,
  };
}

export function pavingDiagramValues(g: CircularPavingLayout): Record<string, number> {
  return {
    pavingLayout: 1, diameter: g.diameter, paverLength: g.length, paverWidth: g.width,
    paverThickness: g.thickness, joint: g.joint, bond: g.halfBond ? 1 : 0, origin: g.jointCentred ? 1 : 0,
  };
}

// MARK: PavingRingGeometry

export type PavingRingGeometry = {
  diameter: number; depth: number; thickness: number; count: number; joint: number;
  outerApothem: number; outerWidth: number; innerWidth: number;
  halfAngle: number; innerApothem: number; innerCornerRadius: number; faceArea: number;
  face: (index: number) => { x: number; y: number }[];
};

export function pavingRingGeometry(
  diameter: number, depth: number, thickness: number, count: number, joint: number,
): PavingRingGeometry | null {
  if (!finite([diameter, depth, thickness, joint])) return null;
  if (!(Math.min(diameter, depth, thickness) > 0) || !(count >= 3 && count <= 360)) return null;
  if (!(joint >= 0) || !(joint < diameter)) return null;
  const r = diameter / 2;
  const h = Math.PI / count;
  const angle = h - Math.asin(joint / diameter);
  if (!(angle > 0)) return null;
  const apothem = r * Math.cos(angle);
  const outer = 2 * r * Math.sin(angle);
  const inner = outer - 2 * depth * Math.tan(h);
  if (!(apothem > depth) || !(inner > 0)) return null;
  const innerApothem = apothem - depth;
  const face = (index: number) => {
    const rotation = index * 2 * h;
    const p = (x: number, y: number) => ({
      x: x * Math.cos(rotation) - y * Math.sin(rotation),
      y: x * Math.sin(rotation) + y * Math.cos(rotation),
    });
    return [
      p(-outer / 2, apothem), p(-inner / 2, innerApothem),
      p(inner / 2, innerApothem), p(outer / 2, apothem),
    ];
  };
  return {
    diameter, depth, thickness, count, joint,
    outerApothem: apothem, outerWidth: outer, innerWidth: inner,
    halfAngle: h, innerApothem, innerCornerRadius: Math.hypot(innerApothem, inner / 2),
    faceArea: ((outer + inner) * depth) / 2, face,
  };
}

export function pavingRingDiagramValues(g: PavingRingGeometry): Record<string, number> {
  return {
    pavingRing: 1, diameter: g.diameter, unitDepth: g.depth, paverThickness: g.thickness,
    count: g.count, joint: g.joint,
  };
}

// MARK: WallpaperLayout

export type WallpaperLayout = {
  span: number; height: number; rollLength: number; rollWidth: number;
  trim: number; repeatLength: number; lead: number;
  dropLength: number; drops: number; perRoll: number; rolls: number;
  patterns: { copies: number; drops: number }[];
};

export function wallpaperLayout(values: Record<string, number>): WallpaperLayout | null {
  const span = values.span ?? 0;
  const height = values.height ?? 0;
  const rollLength = values.rollLength ?? 0;
  const rollWidth = values.rollWidth ?? 0;
  const trim = values.trim ?? 0;
  const repeatLength = values.repeatLength ?? 0;
  const lead = values.rollLead ?? 0;
  if (!finite([span, height, rollLength, rollWidth, trim, repeatLength, lead])) return null;
  if (!(Math.min(span, height, rollLength, rollWidth) > 0)) return null;
  if (!(Math.min(trim, repeatLength, lead) >= 0) || !(lead < rollLength)) return null;
  const raw = height + trim;
  let cut = raw;
  if (repeatLength > 0) {
    const multiples = raw / repeatLength;
    if (Number.isFinite(multiples)) {
      const nearest = swiftRound(multiples);
      const count = Math.abs(multiples - nearest) <= ulp(multiples) * 8 ? nearest : Math.ceil(multiples);
      cut = Math.max(raw, count * repeatLength);
    }
  }
  if (!(cut <= rollLength - lead + ulp(rollLength - lead) * 16)) return null;
  const drops = ceilInt(span / rollWidth, 1, 10_001);
  if (!(drops <= 10_000)) return null;
  const perRoll = floorInt((rollLength - lead) / cut, 1, 1_000_000_000);
  const rolls = ceilInt(drops / perRoll, 1, 10_000);
  const full = Math.trunc(drops / perRoll);
  const last = drops % perRoll;
  const patterns = [
    ...(full > 0 ? [{ copies: full, drops: perRoll }] : []),
    ...(last > 0 ? [{ copies: 1, drops: last }] : []),
  ];
  return {
    span, height, rollLength, rollWidth, trim, repeatLength, lead,
    dropLength: cut, drops, perRoll, rolls, patterns,
  };
}

// MARK: HandoffFingerprint

const stableNumber = (value: number) => value.toFixed(6);

/** Port of `HandoffFingerprint.package` — lengths normalise back to millimetres. */
export function packageFingerprint(
  kind: string, metric: boolean, lengths: number[] = [], values: number[] = [],
): string {
  const canonical = lengths.map((value) => {
    const millimetres = metric ? value : value * 25.4;
    return swiftRound(millimetres * 100) / 100;
  });
  return [
    "v1", kind,
    ...canonical.map((value, index) => `l${index}=${stableNumber(value)}`),
    ...values.map((value, index) => `v${index}=${stableNumber(value)}`),
  ].join("|");
}

/** The default `checks` on `ToolHandoff.init`. */
export const DEFAULT_CHECKS = [
  "Inputs are finite and inside this tool's safe range.",
  "Quantity and selling unit are typed; display text is not parsed.",
];
