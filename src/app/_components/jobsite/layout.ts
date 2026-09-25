/**
 * Where things stand on the dawn job site, in metres. The slab top is y = 0,
 * the back wall runs along x at z = 0, and the camera starts outside the
 * wall (negative z) and walks in towards the sawhorse (positive z).
 * Shared by the 3D scene and the camera path so they can't drift apart.
 */
export type Vec3 = readonly [number, number, number];

/** Timber section: 90 × 45 SG8, the everyday NZ framing size. */
export const T = 0.045;
export const D = 0.09;

export const WALL = {
  x0: -3.6,
  length: 7.2,
  z: 0,
  height: 2.4,
  /** Stud centres, as NZS 3604 walls are usually framed. */
  centres: 0.6,
  /** Window opening between the studs at these x positions. */
  window: { x0: -2.4, x1: -1.2, sill: 0.9, head: 2.05 },
  nogHeight: 1.2,
} as const;

/** The stud bay the camera walks through: between the studs at x = 0 and 0.6. */
export const BAY_X = 0.3;

/** A half-built side wall along z, framed only over its first half. */
export const SIDE_WALL = { x: -3.6, z0: 0, z1: 4.8, framedTo: 2.4 } as const;

/** A few rafters over the left of the back wall, up to a propped ridge. */
export const ROOF = {
  rafterXs: [-3.3, -2.4, -1.5] as readonly number[],
  ridge: { x0: -3.6, x1: -1.2, z: 2.6, y: 3.45 },
  overhang: 0.35,
} as const;

export const SAWHORSE = { x: 0.3, z: 3.2, beamTop: 0.76, beamLength: 1.1 } as const;

/** The phone propped against an offcut on the sawhorse, screen towards the wall. */
export const PHONE = {
  centre: [0.3, 0.832, 3.2] as Vec3,
  width: 0.072,
  height: 0.152,
  /** Leans back 20° from vertical, so its screen faces the camera coming in. */
  leanDeg: 20,
} as const;

/** The screen's outward normal (towards the wall, tilted up by the lean). */
export const PHONE_NORMAL: Vec3 = [
  0,
  Math.sin((PHONE.leanDeg * Math.PI) / 180),
  -Math.cos((PHONE.leanDeg * Math.PI) / 180),
];

/** A point `d` metres straight out from the middle of the phone screen. */
export function inFrontOfPhone(d: number): Vec3 {
  const [x, y, z] = PHONE.centre;
  return [x + PHONE_NORMAL[0] * d, y + PHONE_NORMAL[1] * d, z + PHONE_NORMAL[2] * d];
}

/** The waveform tunnel is built far from the site; the camera cuts to it. */
export const PORTAL_ORIGIN: Vec3 = [0, 0, -600];
export const TUNNEL = { rings: 44, spacing: 1.6, radius: 1.15 } as const;
