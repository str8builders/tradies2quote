/**
 * Geometry helpers behind the ported general-geometry calculators.
 *
 * Line-for-line ports of `Models/SegmentedMoldingGeometry.swift`,
 * `Models/CompoundMiterGeometry.swift` and `GothicArchGeometry` in
 * `Models/ArchGeometry.swift`.
 */

import { rad } from "./format";

const finite = (values: number[]) => values.every((value) => Number.isFinite(value));

/* ------------------------------------------------------- segmented molding */

export type SegmentedMolding = {
  chord: number; longEdge: number; shortEdge: number; netVolume: number;
  diagramValues: Record<string, number>;
};

/** `SegmentedMoldingGeometry.init?` — straight trapezoidal pieces on the joint circle. */
export function segmentedMolding(
  diameter: number, sweep: number, count: number, width: number, depth: number,
): SegmentedMolding | null {
  if (!finite([diameter, sweep, width, depth])) return null;
  if (!(diameter > 0 && sweep > 0 && sweep <= 360)) return null;
  if (!(count >= 2 && count <= 100)) return null;
  if (!(width > 0 && depth > 0 && sweep / count < 180)) return null;
  const halfAngle = rad(sweep / count / 2);
  if (!(diameter / 2 * Math.cos(halfAngle) > width / 2)) return null;
  const chord = diameter * Math.sin(halfAngle);
  const inset = width * Math.tan(halfAngle);
  return {
    chord,
    longEdge: chord + inset,
    shortEdge: chord - inset,
    netVolume: count * chord * width * depth,
    diagramValues: {
      moldingGeometry: 1, diameter, sweep, count, moldingWidth: width, moldingDepth: depth,
    },
  };
}

/* --------------------------------------------------------- compound miter */

export type CompoundMiter = {
  miter: number; bevel: number; cuts: number[]; minimumCut: number;
  cutExtent: number; blankLength: number; wrapStations: number[];
  diagramValues: Record<string, number>;
};

/** `CompoundMiterGeometry.init?` — saw settings for equal sloping panels. */
export function compoundMiter(
  included: number, sideAngle: number, width: number, thickness: number, tail: number,
): CompoundMiter | null {
  if (!finite([included, sideAngle, width, thickness, tail])) return null;
  if (!(included > 0 && included <= 180)) return null;
  if (!(sideAngle >= 0 && sideAngle <= 90)) return null;
  if (!(width > 0 && thickness > 0 && tail > 0)) return null;
  const h = rad(included / 2), s = rad(sideAngle);
  // Components of the vertical joint-plane normal in the stock's local frame.
  const nx = Math.sin(h), ny = Math.cos(h) * Math.cos(s), nz = -Math.cos(h) * Math.sin(s);
  const section: [number, number][] = [[0, 0], [width, 0], [width, thickness], [0, thickness]];
  const cut = (y: number, z: number) => -(ny * y + nz * z) / nx;
  const cuts = section.map(([y, z]) => cut(y, z));
  const minimumCut = Math.min(...cuts), maximumCut = Math.max(...cuts);
  const cutExtent = maximumCut - minimumCut;
  return {
    miter: Math.atan2(Math.abs(ny), nx) * 180 / Math.PI,
    bevel: Math.asin(Math.min(1, Math.abs(nz))) * 180 / Math.PI,
    cuts, minimumCut, cutExtent,
    blankLength: cutExtent + tail,
    wrapStations: [0, width, width + thickness, 2 * width + thickness, 2 * (width + thickness)],
    diagramValues: {
      compoundGeometry: 1, planAngle: included, slope: sideAngle, width, thickness, tail,
    },
  };
}

/* ------------------------------------------------------------ gothic arch */

/** `GothicArchGeometry` — two struck centres on the springing line. */
export function gothicArch(span: number, rise: number): { radius: number; offset: number; sweep: number } {
  const radius = (rise * rise + span * span / 4) / span;
  const offset = radius - span / 2;
  return { radius, offset, sweep: Math.atan2(rise, offset) };
}
