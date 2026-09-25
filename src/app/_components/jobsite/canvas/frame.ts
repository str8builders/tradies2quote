import { D, PHONE, ROOF, SAWHORSE, SIDE_WALL, T, WALL, type Vec3 } from "../layout";

/**
 * The half-built timber frame on the dawn site, as real members: 90 × 45
 * studs at 600 centres, a double top plate, staggered nogs, a window with
 * its lintel, sill and cripples, a half-framed side wall, a few rafters up
 * to a propped ridge, a sawhorse, the offcut the phone leans on, and a
 * pack of studs. Pure data — the scene turns each member into one
 * instance of a single timber mesh.
 *
 * A member runs from `a` to `b` (always in its positive direction). `h` is
 * its size across the run in the local "up" direction and `w` its size in
 * the local "side" direction, after rotating the x axis onto the run.
 */
export type Member = { a: Vec3; b: Vec3; h: number; w: number };

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Stud positions along the back wall: every 600 mm from end to end. */
export function studXs(): number[] {
  const out: number[] = [];
  const count = Math.round(WALL.length / WALL.centres);
  for (let i = 0; i <= count; i++) out.push(round(WALL.x0 + i * WALL.centres));
  return out;
}

function backWall(): Member[] {
  const { x0, length, z, height: H, window: win, nogHeight } = WALL;
  const x1 = round(x0 + length);
  const m: Member[] = [];
  // Bottom plate and double top plate (studs sit between them).
  m.push({ a: [x0, T / 2, z], b: [x1, T / 2, z], h: T, w: D });
  m.push({ a: [x0, H - T / 2, z], b: [x1, H - T / 2, z], h: T, w: D });
  m.push({ a: [x0, H - 1.5 * T, z], b: [x1, H - 1.5 * T, z], h: T, w: D });
  const xs = studXs();
  const inWindow = (x: number) => x > win.x0 + 1e-6 && x < win.x1 - 1e-6;
  for (const x of xs) {
    if (inWindow(x)) {
      // Cripples above the lintel and below the sill, on the stud line.
      m.push({ a: [x, win.head + 0.14, z], b: [x, H - 2 * T, z], h: T, w: D });
      m.push({ a: [x, T, z], b: [x, win.sill - T, z], h: T, w: D });
      continue;
    }
    m.push({ a: [x, T, z], b: [x, H - 2 * T, z], h: T, w: D });
  }
  // Lintel (on edge) and sill across the window opening.
  m.push({ a: [win.x0 + T / 2, win.head + 0.07, z], b: [win.x1 - T / 2, win.head + 0.07, z], h: 0.14, w: D });
  m.push({ a: [win.x0 + T / 2, win.sill - T / 2, z], b: [win.x1 - T / 2, win.sill - T / 2, z], h: T, w: D });
  // Nogs between studs, staggered 50 mm so each can be end-nailed.
  for (let i = 0; i < xs.length - 1; i++) {
    const left = xs[i];
    const right = xs[i + 1];
    const mid = (left + right) / 2;
    if (mid > win.x0 && mid < win.x1) continue;
    const y = nogHeight + (i % 2 === 0 ? 0.025 : -0.025);
    m.push({ a: [left + T / 2, y, z], b: [right - T / 2, y, z], h: T, w: D });
  }
  return m;
}

function sideWall(): Member[] {
  const { x, z0, z1, framedTo } = SIDE_WALL;
  const H = WALL.height;
  const m: Member[] = [];
  // Along z the 90 face is across x: h stays vertical (45), w becomes x (90).
  m.push({ a: [x, T / 2, z0 + T], b: [x, T / 2, z1], h: T, w: D });
  m.push({ a: [x, H - T / 2, z0 + T], b: [x, H - T / 2, framedTo], h: T, w: D });
  for (let z = z0 + WALL.centres; z <= framedTo + 1e-6; z = round(z + WALL.centres)) {
    // A vertical stud in a wall along z: across-x is 90 (h), along-z is 45 (w).
    m.push({ a: [x, T, z], b: [x, H - T, z], h: D, w: T });
  }
  return m;
}

function roof(): Member[] {
  const { rafterXs, ridge, overhang } = ROOF;
  const H = WALL.height;
  const m: Member[] = [];
  const rise = ridge.y - H;
  const slope = rise / ridge.z;
  for (const x of rafterXs) {
    // 140 × 45 rafters on edge: from the overhang, over the top plate, to the ridge.
    m.push({ a: [x, H - slope * overhang + 0.07, -overhang], b: [x, ridge.y, ridge.z], h: 0.14, w: T });
  }
  // Ridge beam on two props.
  m.push({ a: [ridge.x0, ridge.y + 0.09, ridge.z], b: [ridge.x1, ridge.y + 0.09, ridge.z], h: 0.18, w: T });
  for (const x of [ridge.x0 + 0.2, ridge.x1 - 0.2]) {
    m.push({ a: [x, 0, ridge.z], b: [x, ridge.y, ridge.z], h: D, w: D });
  }
  return m;
}

function sawhorse(): Member[] {
  const { x, z, beamTop, beamLength } = SAWHORSE;
  const half = beamLength / 2;
  const m: Member[] = [];
  // Beam on edge, along x.
  m.push({ a: [x - half, beamTop - D / 2, z], b: [x + half, beamTop - D / 2, z], h: D, w: T });
  // Four splayed legs.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const top: Vec3 = [x + sx * (half - 0.12), beamTop - D, z + sz * 0.03];
      const foot: Vec3 = [x + sx * (half - 0.02), 0, z + sz * 0.28];
      // Keep every member pointing "up" its length so the rotation is well defined.
      m.push({ a: foot, b: top, h: T, w: D });
    }
  }
  // The offcut the phone leans against, lying across the beam.
  const [px, , pz] = PHONE.centre;
  m.push({ a: [px - 0.12, beamTop + T / 2, pz + 0.07], b: [px + 0.12, beamTop + T / 2, pz + 0.07], h: T, w: D });
  return m;
}

function studPack(): Member[] {
  const m: Member[] = [];
  const x = 2.2;
  const z = 5.6;
  for (let layer = 0; layer < 3; layer++) {
    for (let i = 0; i < 6; i++) {
      const zz = z + i * (D + 0.004);
      const y = T / 2 + layer * (T + 0.002);
      m.push({ a: [x - 1.8, y, zz], b: [x + 1.8, y, zz], h: T, w: D });
    }
  }
  return m;
}

export function frameMembers(): Member[] {
  return [...backWall(), ...sideWall(), ...roof(), ...sawhorse(), ...studPack()];
}

/** Axis-aligned bounds of a member (its box, rotated), for clearance checks. */
export function memberBounds(mem: Member): { min: Vec3; max: Vec3 } {
  const dir = [mem.b[0] - mem.a[0], mem.b[1] - mem.a[1], mem.b[2] - mem.a[2]];
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  // Conservative: pad the segment by the larger cross-section size.
  const pad = Math.max(mem.h, mem.w) / 2 + 1e-9;
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const lo = Math.min(mem.a[k], mem.b[k]);
    const hi = Math.max(mem.a[k], mem.b[k]);
    // A member running along axis k only needs the pad across the other axes.
    const along = Math.abs(dir[k]) / len > 0.999;
    min[k] = lo - (along ? 0 : pad);
    max[k] = hi + (along ? 0 : pad);
  }
  return { min, max };
}
