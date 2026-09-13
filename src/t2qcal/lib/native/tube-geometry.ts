/**
 * Geometry the native metal & tubing tools call, ported line for line:
 *   Engine/TubeCut.swift            — station-by-station cut depth round a wrap
 *   Models/TubeBendGeometry.swift   — smooth and segmented pipe bends
 *   Models/RoundSquareGeometry.swift — one quarter of a round-to-square transition
 *   Models/SquareTubeMiterGeometry.swift — planar miter on a rectangular section
 *
 * Kept separate from `native/tube.ts` so the compute closures stay a readable
 * transcription of `Models/ToolsTube.swift`.
 */

const radians = (degrees: number) => (degrees * Math.PI) / 180;
const clampAngle = (angle: number) => Math.min(Math.max(angle, 1), 179);

/**
 * Depth at a wrap angle, in the drawing unit. Zero is the shortest point of the
 * cut. A miter (joint 1) and a tube through a sheet (joint 2) each meet a single
 * plane, so their profile is a raised cosine; a notch (joint 0) saddles a parent
 * tube, which is the classic fishmouth.
 */
export function tubeCutProfile(
  joint: number,
  diameter: number,
  parent: number,
  angle: number,
): (theta: number) => number {
  const r = Math.max(diameter, 0.001) / 2;
  const alpha = radians(clampAngle(angle));
  if (joint === 1) {
    const depth = 2 * r * Math.tan(radians((180 - clampAngle(angle)) / 2));
    return (theta: number) => (depth * (1 + Math.cos(theta))) / 2;
  }
  if (joint === 2) {
    const depth = 2 * r * Math.abs(Math.cos(alpha) / Math.sin(alpha));
    return (theta: number) => (depth * (1 + Math.cos(theta))) / 2;
  }
  // A branch can never be wider than the tube it saddles onto.
  const R = Math.max(parent / 2, r);
  const cut = (theta: number) => {
    const lateral = r * Math.sin(theta);
    const saddle = R - Math.sqrt(Math.max(0, R * R - lateral * lateral));
    return (saddle + r * Math.cos(theta) * Math.cos(alpha)) / Math.sin(alpha);
  };
  // measure from the shortest station so the printed depths start at zero
  const floorValue = (-r * Math.abs(Math.cos(alpha))) / Math.sin(alpha);
  return (theta: number) => Math.max(0, cut(theta) - floorValue);
}

/**
 * Exact maximum: the saddle is concave in cos(theta), so its maximum is either
 * at the stationary cosine or at an end of [-1, 1].
 */
export function tubeCutMaximumDepth(joint: number, diameter: number, parent: number, angle: number): number {
  const r = Math.max(diameter, 0.001) / 2;
  const a = radians(clampAngle(angle));
  if (joint === 1) return 2 * r * Math.tan(radians((180 - clampAngle(angle)) / 2));
  if (joint === 2) return 2 * r * Math.abs(Math.cos(a) / Math.sin(a));
  const R = Math.max(parent / 2, r);
  const b = Math.max(0, R * R - r * r);
  const x = Math.max(-1, Math.min(1, (Math.cos(a) * Math.sqrt(b)) / (r * Math.sin(a))));
  return (R - Math.sqrt(b + r * r * x * x) + r * Math.cos(a) * x + r * Math.abs(Math.cos(a))) / Math.sin(a);
}

/** Models/TubeBendGeometry.swift — only the parts the catalogue tools read. */
export class TubeBendGeometry {
  constructor(
    readonly diameter: number,
    readonly radius: number,
    readonly angle: number,
    readonly straight: number,
  ) {}

  get theta(): number {
    return (this.angle * Math.PI) / 180;
  }

  get arcLength(): number {
    return this.radius * this.theta;
  }

  halfPiece(joints: number): number {
    return this.radius * Math.tan(this.theta / joints / 2);
  }
}

type Point = { x: number; y: number };

/**
 * Models/RoundSquareGeometry.swift — one quarter of a concentric round-to-square
 * transition, built from a flat side triangle and a fan of planar corner facets.
 */
export class RoundSquareGeometry {
  constructor(
    readonly diameter: number,
    readonly square: number,
    readonly height: number,
    readonly facets: number,
  ) {}

  get radius(): number {
    return this.diameter / 2;
  }

  get halfSide(): number {
    return this.square / 2;
  }

  get faceSlant(): number {
    return Math.hypot(this.height, this.radius - this.halfSide);
  }

  get cornerSlant(): number {
    return Math.hypot(this.height, this.radius - this.square / Math.sqrt(2));
  }

  get baseChord(): number {
    return 2 * this.radius * Math.sin(Math.PI / this.facets / 4);
  }

  basePoint(index: number): Point {
    const angle = (index * Math.PI) / this.facets / 2;
    return { x: this.radius * Math.cos(angle), y: this.radius * Math.sin(angle) };
  }

  generator(index: number): number {
    const point = this.basePoint(index);
    const dx = point.x - this.halfSide;
    const dy = point.y - this.halfSide;
    return Math.sqrt(dx * dx + dy * dy + this.height * this.height);
  }

  get flatArc(): Point[] {
    const chord = this.baseChord;
    let angle = Math.atan2(-this.faceSlant, -this.halfSide);
    const points: Point[] = [{ x: -this.halfSide, y: -this.faceSlant }];
    for (let i = 0; i < this.facets; i += 1) {
      const a = this.generator(i);
      const b = this.generator(i + 1);
      angle += Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - chord * chord) / (2 * a * b))));
      points.push({ x: b * Math.cos(angle), y: b * Math.sin(angle) });
    }
    return points;
  }

  get flatEnd(): Point {
    const arc = this.flatArc;
    const last = arc[arc.length - 1];
    const side = this.generator(this.facets);
    const half = this.halfSide;
    const face = this.faceSlant;
    const angle =
      Math.atan2(last.y, last.x) +
      Math.acos(Math.max(-1, Math.min(1, (side * side + half * half - face * face) / (2 * side * half))));
    return { x: half * Math.cos(angle), y: half * Math.sin(angle) };
  }

  get outline(): Point[] {
    return [
      { x: -this.halfSide, y: 0 },
      { x: 0, y: 0 },
      this.flatEnd,
      ...[...this.flatArc].reverse(),
      { x: -this.halfSide, y: 0 },
    ];
  }

  get totalSheetArea(): number {
    const p = this.outline;
    let sum = 0;
    for (let i = 0; i + 1 < p.length; i += 1) sum += p[i].x * p[i + 1].y - p[i + 1].x * p[i].y;
    return Math.abs(sum) * 2;
  }
}

/** Models/SquareTubeMiterGeometry.swift — the two values the tool prints. */
export class SquareTubeMiterGeometry {
  constructor(
    readonly width: number,
    readonly depth: number,
    readonly included: number,
  ) {}

  get sawAngle(): number {
    return (180 - this.included) / 2;
  }

  get offset(): number {
    return this.width * Math.tan((this.sawAngle * Math.PI) / 180);
  }
}
