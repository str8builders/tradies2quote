import { BAY_X, PHONE, inFrontOfPhone, type Vec3 } from "./layout";

/**
 * The master timeline: scroll position → scene → camera shot.
 *
 * Every scene is a tall section of the page. A scene runs from its top
 * reaching the top of the screen to its bottom reaching the bottom (its copy
 * stays pinned meanwhile), so `t` goes 0 → 1 across it and scrolling back
 * plays it in reverse. Pure functions only, so the whole journey is tested.
 *
 * The 3D covers the first two scenes: the dawn site and the dive into the
 * phone, which ends in a warm flash. The house (one room per step of the
 * job) and the details after it are page content over the flash.
 */
export const SCENES = ["site", "portal", "house", "details"] as const;
export type SceneId = (typeof SCENES)[number];

export type SceneBox = { id: SceneId; top: number; height: number };
export type Located = { scene: SceneId; t: number };

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function locate(scrollY: number, viewportH: number, boxes: readonly SceneBox[]): Located {
  if (boxes.length === 0) return { scene: "site", t: 0 };
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    if (scrollY >= box.top || i === 0) {
      const span = Math.max(1, box.height - viewportH);
      return { scene: box.id, t: clamp01((scrollY - box.top) / span) };
    }
  }
  return { scene: boxes[0].id, t: 0 };
}

/**
 * The whole journey as one number: scene index + t (site 0–1, portal 1–2, …).
 * The camera eases this number, not its position, so it always stays on the
 * path: a jump link flies the camera along the route, never through a wall.
 */
export function progressOf({ scene, t }: Located): number {
  return SCENES.indexOf(scene) + t;
}

export function locatedAt(progress: number): Located {
  const last = SCENES.length - 1;
  const p = Math.min(last + 1, Math.max(0, progress));
  const i = Math.min(last, Math.floor(p));
  return { scene: SCENES[i], t: p - i };
}

/** Frame-rate independent smoothing towards `target`; `lambda` ≈ 1 / seconds. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

// ── Camera keyframes ───────────────────────────────────────────────────

type Key = { t: number; pos: Vec3; look: Vec3 };

const SCREEN = PHONE.centre;

/** Scene 1: outside the back wall at first light, through a stud bay, down to the phone. */
const SITE_KEYS: readonly Key[] = [
  { t: 0, pos: [1.4, 1.8, -7.8], look: [0.3, 1.1, 3.2] },
  { t: 0.3, pos: [0.9, 1.65, -4.2], look: [0.3, 1.05, 3.2] },
  { t: 0.55, pos: [BAY_X + 0.05, 1.52, -1.0], look: [0.3, 1.0, 3.2] },
  { t: 0.66, pos: [BAY_X, 1.5, 0], look: [0.3, 0.96, 3.2] },
  { t: 0.85, pos: [BAY_X, 1.22, 1.7], look: [0.3, 0.88, 3.2] },
  { t: 1, pos: inFrontOfPhone(0.6), look: SCREEN },
];

/** Scene 2: the camera pushes into the phone's screen; the flash takes over. */
export const PHONE_FILLS = 0.85;
const PHONE_KEYS: readonly Key[] = [
  { t: 0, pos: inFrontOfPhone(0.6), look: SCREEN },
  { t: PHONE_FILLS, pos: inFrontOfPhone(0.12), look: SCREEN },
  { t: 1, pos: inFrontOfPhone(0.11), look: SCREEN },
];

/** Uniform Catmull-Rom through the keys; passes every key with a smooth tangent. */
function along(keys: readonly Key[], t: number, pick: (k: Key) => Vec3): Vec3 {
  if (t <= keys[0].t) return pick(keys[0]);
  const last = keys.length - 1;
  if (t >= keys[last].t) return pick(keys[last]);
  let i = 0;
  while (i < last - 1 && t > keys[i + 1].t) i++;
  const u = (t - keys[i].t) / (keys[i + 1].t - keys[i].t);
  const p0 = pick(keys[Math.max(0, i - 1)]);
  const p1 = pick(keys[i]);
  const p2 = pick(keys[i + 1]);
  const p3 = pick(keys[Math.min(last, i + 2)]);
  const u2 = u * u;
  const u3 = u2 * u;
  const out = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] =
      0.5 *
      (2 * p1[k] +
        (-p0[k] + p2[k]) * u +
        (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
        (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return [out[0], out[1], out[2]];
}

/**
 * Where the camera is:
 *   site — the dawn job site (and the phone on the sawhorse)
 *   none — inside the house and after: the 3D is hidden behind the page
 */
export type Space = "site" | "none";

export type Shot = {
  space: Space;
  pos: Vec3;
  look: Vec3;
  /** Warm white flash over the canvas as the phone's screen fills the frame (0–1). */
  flash: number;
  /** Fade of the 3D layer, once the flash covers it (0–1). */
  fade: number;
};

const smooth = (a: number, b: number, x: number) => {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

export function shotAt({ scene, t }: Located): Shot {
  if (scene === "site") {
    return {
      space: "site",
      pos: along(SITE_KEYS, t, (k) => k.pos),
      look: along(SITE_KEYS, t, (k) => k.look),
      flash: 0,
      fade: 0,
    };
  }
  if (scene === "portal") {
    // The flash peaks as the screen fills the frame and stays up; the first
    // room then slides in over it. The 3D is hidden once it's fully covered.
    return {
      space: "site",
      pos: along(PHONE_KEYS, t, (k) => k.pos),
      look: along(PHONE_KEYS, t, (k) => k.look),
      flash: smooth(PHONE_FILLS - 0.2, PHONE_FILLS, t),
      fade: smooth(PHONE_FILLS, 1, t),
    };
  }
  const end = PHONE_KEYS[PHONE_KEYS.length - 1];
  // Inside the house the rooms cover everything; the flash stays up under
  // them for the moment the first room slides in, then drops.
  const flash = scene === "house" ? 1 - smooth(0, 0.05, t) : 0;
  return { space: "none", pos: end.pos, look: end.look, flash, fade: 1 };
}

/** Portrait phones need a wider lens to keep the frame in shot. */
export function fovFor(aspect: number): number {
  if (aspect < 0.8) return 62;
  if (aspect < 1.2) return 52;
  return 45;
}

/** The phone screen wakes (someone talks the job through) as the camera comes through the frame. */
export function phoneAwake({ scene, t }: Located): boolean {
  return (scene === "site" && t > 0.5) || scene === "portal";
}
