/**
 * Geometry helpers behind the ported concrete & masonry calculators.
 *
 * Line-for-line ports of the native structs the Swift compute closures call:
 * `Models/RectangularPour.swift`, `Models/CircularBlockWall.swift`,
 * `Models/MasonryPanel.swift`, `Models/ArchGeometry.swift`,
 * `Models/BalancedSpacing.swift` and `HandoffFingerprint` in
 * `Models/ToolHandoff.swift`.
 */

import { ceilInt, floorInt, ulp } from "./format";

const MM_PER_INCH = 25.4;

/** Swift `Sequence.min(by:)` — keeps the first element unless a later one sorts before it. */
function minBy<T>(items: T[], before: (a: T, b: T) => boolean): T | null {
  if (items.length === 0) return null;
  let best = items[0];
  for (let i = 1; i < items.length; i += 1) if (before(items[i], best)) best = items[i];
  return best;
}

const finite = (values: number[]) => values.every((value) => Number.isFinite(value));

/* ------------------------------------------------------------------ pour */

/** `RectangularPour` — non-overlapping prisms, edge beams inside the slab outline. */
export function rectangularPourVolume(
  length: number, width: number, thickness: number, beamWidth: number, beamDepth: number,
): number | null {
  if (!finite([length, width, thickness, beamWidth, beamDepth])) return null;
  if (!(length > 0 && width > 0 && thickness >= 0 && beamWidth >= 0 && beamDepth >= 0)) return null;
  if (!(beamWidth === 0 || beamDepth >= thickness)) return null;
  const extra = beamWidth > 0 ? Math.max(0, beamDepth - thickness) : 0;
  let volume = 0;
  if (extra > 0) {
    if (2 * beamWidth >= Math.min(length, width)) {
      volume += length * width * extra;
    } else {
      volume += length * beamWidth * extra;
      volume += length * beamWidth * extra;
      volume += beamWidth * (width - 2 * beamWidth) * extra;
      volume += beamWidth * (width - 2 * beamWidth) * extra;
    }
  }
  volume += length * width * thickness;
  return volume;
}

/* ----------------------------------------------------- circular block wall */

export type CircularWall = {
  radius: number; length: number; width: number; height: number; bed: number; originHeight: number;
  count: number; courses: number;
  angle: number; innerRadius: number; outerRadius: number; totalHeight: number;
  innerGap: number; centreGap: number; outerGap: number;
  courseTop: (row: number) => number;
  diagonal: (row: number) => number;
  diagramValues: Record<string, number>;
};

/** `CircularBlockWall.init?` — rectangular blocks tangent to the centre circle. */
export function circularBlockWall(input: {
  diameter: number; length: number; width: number; height: number;
  joint: number; bed: number; courses: number; override: number; originHeight: number;
}): CircularWall | null {
  const { diameter, length, width, height, joint, bed, courses, originHeight } = input;
  const override = input.override;
  if (!finite([diameter, length, width, height, joint, bed, originHeight])) return null;
  if (!(Math.min(diameter, length, width, height) > 0)) return null;
  if (!(Math.min(joint, bed, originHeight) >= 0)) return null;
  if (!(diameter > width)) return null;
  if (!(courses >= 1 && courses <= 100)) return null;
  if (!(override >= 0)) return null;

  const r = diameter / 2;
  const inner = r - width / 2;
  const maximum = floorInt(Math.PI / Math.atan2(length, 2 * inner), 0, 1_000_000_000);
  if (!(maximum >= 3)) return null;

  let chosen: number;
  if (override > 0) {
    if (!(override >= 3 && override <= maximum)) return null;
    chosen = override;
  } else {
    const amplitude = Math.hypot(2 * r, length);
    const half = Math.atan2(length, 2 * r) + Math.asin(Math.min(1, joint / amplitude));
    const ideal = Math.PI / half;
    const candidates = [...new Set([3, maximum, floorInt(ideal, 3, maximum), ceilInt(ideal, 3, maximum)])].sort((a, b) => a - b);
    const gapFor = (count: number) => 2 * r * Math.sin(Math.PI / count) - length * Math.cos(Math.PI / count);
    const best = minBy(candidates, (a, b) => {
      const ea = Math.abs(gapFor(a) - joint), eb = Math.abs(gapFor(b) - joint);
      return Math.abs(ea - eb) > ulp(r) * 16 ? ea < eb : a < b;
    });
    if (best === null) return null;
    chosen = best;
  }
  // Swift integer division: 10_000 / courses.
  if (!(chosen <= Math.trunc(10_000 / courses))) return null;

  const count = chosen;
  const halfAngle = Math.PI / count;
  const innerRadius = r - width / 2;
  const gap = (radius: number) => 2 * radius * Math.sin(halfAngle) - length * Math.cos(halfAngle);
  const courseTop = (row: number) => (row + 1) * height + row * bed;
  return {
    radius: r, length, width, height, bed, originHeight, count, courses,
    angle: 2 * halfAngle,
    innerRadius,
    outerRadius: Math.hypot(r + width / 2, length / 2),
    totalHeight: courses * height + (courses - 1) * bed,
    innerGap: Math.max(0, gap(innerRadius)),
    centreGap: gap(r),
    outerGap: gap(r + width / 2),
    courseTop,
    diagonal: (row: number) => Math.hypot(r, courseTop(row) - originHeight),
    diagramValues: {
      circularWallGeometry: 1, diameter: 2 * r, blockLength: length, blockWidth: width, blockHeight: height,
      bedJoint: bed, courses, blockCount: count, joint: gap(r), originHeight,
    },
  };
}

/* ------------------------------------------------------------- masonry panel */

export type MasonryPanel = { courses: number; diagramValues: Record<string, number> };

/** `MasonryPanel.init?` — running bond clipped to the entered gross wall. */
export function masonryPanel(input: {
  length: number; height: number; unitLength: number; unitHeight: number; depth: number;
  headJoint: number; bedJoint: number; fullFit?: boolean;
}): MasonryPanel | null {
  const { length, height, unitLength, unitHeight, depth, headJoint, bedJoint } = input;
  const fullFit = input.fullFit === true;
  if (!finite([length, height, unitLength, unitHeight, depth, headJoint, bedJoint])) return null;
  if (!(Math.min(length, height, unitLength, unitHeight, depth) > 0)) return null;
  if (!(Math.min(headJoint, bedJoint) >= 0)) return null;
  const rows = ceilInt((height + (fullFit ? bedJoint : 0)) / (unitHeight + bedJoint), 1, 10_001);
  const columns = ceilInt((length + (unitLength + headJoint) / 2) / (unitLength + headJoint), 1, 10_001);
  if (!(rows * columns <= 10_000)) return null;
  return {
    courses: rows,
    diagramValues: {
      masonryGeometry: 1, length, height, unitLength, unitHeight,
      wallDepth: depth, headJoint, bedJoint, fullFit: fullFit ? 1 : 0,
    },
  };
}

/** `ClosingUnitRun.init?` — full units at both ends, joints only between them. */
export function closingUnitRun(span: number, unit: number, target: number): { count: number; gap: number } | null {
  if (!finite([span, unit, target])) return null;
  if (!(span > 0 && unit > 0 && target >= 0)) return null;
  if (Math.abs(span - unit) <= ulp(span) * 16) return { count: 1, gap: 0 };
  if (!(span >= 2 * unit && span / unit <= 1_000_000_000)) return null;
  const maximum = floorInt(span / unit, 2, 1_000_000_000);
  const ideal = (span + target) / (unit + target);
  const candidates = [...new Set([2, maximum, floorInt(ideal, 2, maximum), ceilInt(ideal, 2, maximum)])].sort((a, b) => a - b);
  const tolerance = ulp(Math.max(span, target)) * 16;
  const best = minBy(candidates, (a, b) => {
    const ga = (span - a * unit) / (a - 1), gb = (span - b * unit) / (b - 1);
    const ea = Math.abs(ga - target), eb = Math.abs(gb - target);
    return Math.abs(ea - eb) > tolerance ? ea < eb : a < b;
  });
  if (best === null) return null;
  if (!(best <= 10_000)) return null;
  return { count: best, gap: Math.max(0, (span - best * unit) / (best - 1)) };
}

/* ---------------------------------------------------------------- arch ring */

export type MasonryArch = {
  inner: number; outer: number; module: number; gapAngle: number; unitAngle: number;
  innerChord: number; outerChord: number; netArea: number; wallDepth: number;
};

/** `MasonryArchGeometry` — equal radial voussoirs in a semicircular ring. */
export function masonryArch(span: number, ringDepth: number, count: number, joint: number, wallDepth: number): MasonryArch {
  const inner = span / 2;
  const outer = inner + ringDepth;
  const moduleAngle = Math.PI / count;
  const gapAngle = 2 * Math.asin(joint / (2 * inner));
  const unitAngle = moduleAngle - gapAngle;
  return {
    inner, outer, module: moduleAngle, gapAngle, unitAngle,
    innerChord: 2 * inner * Math.sin(unitAngle / 2),
    outerChord: 2 * outer * Math.sin(unitAngle / 2),
    netArea: count * unitAngle * (outer * outer - inner * inner) / 2,
    wallDepth,
  };
}

/* ----------------------------------------------------------- spacing solver */

/** `BalancedSpacing.solve` — n members with n + 1 equal clear gaps. */
export function balancedSpacing(span: number, width: number, target: number, maximumGap = false): { count: number; gap: number } | null {
  if (!finite([span, width, target])) return null;
  if (!(span > 0 && width >= 0 && target >= 0 && width <= span && width + target > 0)) return null;
  const ideal = (span - target) / (width + target);
  if (!(ideal <= 10_000)) return null;
  const fitting = width > 0 ? floorInt(span / width, 1, 10_000) : 10_000;
  const counts = [...new Set([floorInt(ideal, 1, fitting), ceilInt(ideal, 1, fitting)])].sort((a, b) => a - b);
  const tolerance = ulp(span) * 8;
  const layouts = counts
    .map((count) => ({ count, gap: Math.max(0, (span - count * width) / (count + 1)) }))
    .filter((layout) => !maximumGap || layout.gap <= target + tolerance);
  return minBy(layouts, (x, y) => {
    const a = Math.abs(x.gap - target), b = Math.abs(y.gap - target);
    return Math.abs(a - b) <= tolerance ? x.count < y.count : a < b;
  });
}

/* ------------------------------------------------------------- fingerprints */

const stableNumber = (value: number) => value.toFixed(6);

/** `HandoffFingerprint.package` — lengths normalised back to millimetres. */
export function packageFingerprint(
  kind: string, metric: boolean, lengths: number[] = [], values: number[] = [],
): string {
  const canonical = lengths.map((value) => {
    const millimetres = metric ? value : value * MM_PER_INCH;
    return Math.round(millimetres * 100) / 100;
  });
  return [
    "v1", kind,
    ...canonical.map((value, index) => `l${index}=${stableNumber(value)}`),
    ...values.map((value, index) => `v${index}=${stableNumber(value)}`),
  ].join("|");
}

