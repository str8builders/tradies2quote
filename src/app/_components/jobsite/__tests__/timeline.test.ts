import { describe, expect, it } from "vitest";
import { PHONE } from "../layout";
import { PHONE_FILLS, damp, fovFor, locate, locatedAt, phoneAwake, progressOf, shotAt, type SceneBox } from "../timeline";

const VH = 800;
const BOXES: SceneBox[] = [
  { id: "site", top: 0, height: 2400 },
  { id: "portal", top: 2400, height: 1600 },
  { id: "house", top: 4000, height: 6000 },
];

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe("locate — scroll position to scene", () => {
  it("runs each scene 0 → 1 while its copy is pinned", () => {
    expect(locate(0, VH, BOXES)).toEqual({ scene: "site", t: 0 });
    expect(locate(800, VH, BOXES)).toEqual({ scene: "site", t: 0.5 });
    expect(locate(1600, VH, BOXES)).toEqual({ scene: "site", t: 1 });
    expect(locate(2000, VH, BOXES)).toEqual({ scene: "site", t: 1 });
    expect(locate(2400, VH, BOXES)).toEqual({ scene: "portal", t: 0 });
    expect(locate(2800, VH, BOXES)).toEqual({ scene: "portal", t: 0.5 });
    expect(locate(99999, VH, BOXES).scene).toBe("house");
  });

  it("before the first scene (under the header) it's the start of the site", () => {
    expect(locate(-50, VH, BOXES)).toEqual({ scene: "site", t: 0 });
    expect(locate(0, VH, [])).toEqual({ scene: "site", t: 0 });
  });
});

describe("shotAt — the camera path", () => {
  it("scrolling a little never jumps the camera", () => {
    for (const scene of ["site", "portal"] as const) {
      let prev = shotAt({ scene, t: 0 });
      for (let i = 1; i <= 400; i++) {
        const shot = shotAt({ scene, t: i / 400 });
        expect(dist(shot.pos, prev.pos)).toBeLessThan(0.6);
        prev = shot;
      }
    }
  });

  it("the site scene hands over to the portal scene at the same spot, in front of the phone", () => {
    const end = shotAt({ scene: "site", t: 1 });
    const start = shotAt({ scene: "portal", t: 0 });
    expect(dist(end.pos, start.pos)).toBeLessThan(1e-9);
    expect(dist(end.look, PHONE.centre)).toBeLessThan(1e-9);
  });

  it("the flash covers the frame as the phone's screen fills it; the 3D hides only once covered", () => {
    expect(shotAt({ scene: "portal", t: 0.3 }).flash).toBe(0);
    expect(shotAt({ scene: "portal", t: PHONE_FILLS }).flash).toBe(1);
    expect(shotAt({ scene: "portal", t: PHONE_FILLS }).fade).toBe(0);
    expect(shotAt({ scene: "portal", t: 1 })).toMatchObject({ flash: 1, fade: 1 });
  });

  it("the first room slides in over the flash, then the flash drops; the house has no 3D", () => {
    expect(shotAt({ scene: "house", t: 0 })).toMatchObject({ space: "none", flash: 1, fade: 1 });
    expect(shotAt({ scene: "house", t: 0.2 }).flash).toBe(0);
    expect(shotAt({ scene: "details", t: 0.5 })).toMatchObject({ space: "none", flash: 0, fade: 1 });
  });

  it("the phone wakes as the camera comes through the frame and stays awake into the screen", () => {
    expect(phoneAwake({ scene: "site", t: 0.2 })).toBe(false);
    expect(phoneAwake({ scene: "site", t: 0.8 })).toBe(true);
    expect(phoneAwake({ scene: "portal", t: 0.9 })).toBe(true);
    expect(phoneAwake({ scene: "house", t: 0.1 })).toBe(false);
  });
});

describe("progress — the journey as one number the camera eases along", () => {
  it("round-trips and runs scene into scene", () => {
    expect(progressOf({ scene: "portal", t: 0.25 })).toBe(1.25);
    expect(locatedAt(1.25)).toEqual({ scene: "portal", t: 0.25 });
    expect(locatedAt(1)).toEqual({ scene: "portal", t: 0 });
    expect(locatedAt(-3)).toEqual({ scene: "site", t: 0 });
    expect(locatedAt(99)).toEqual({ scene: "details", t: 1 });
  });

  it("easing across the site → portal join never jumps the camera", () => {
    let prev = shotAt(locatedAt(0.9));
    for (let p = 0.9; p <= 1.2; p += 0.002) {
      const shot = shotAt(locatedAt(p));
      expect(dist(shot.pos, prev.pos)).toBeLessThan(0.05);
      prev = shot;
    }
  });
});

describe("damp and lens", () => {
  it("smooths the same whatever the frame rate", () => {
    const oneStep = damp(0, 10, 4, 1 / 30);
    const twoSteps = damp(damp(0, 10, 4, 1 / 60), 10, 4, 1 / 60);
    expect(twoSteps).toBeCloseTo(oneStep, 10);
    expect(damp(3, 3, 4, 0.016)).toBe(3);
  });

  it("widens the lens for portrait phones", () => {
    expect(fovFor(0.46)).toBe(62);
    expect(fovFor(1)).toBe(52);
    expect(fovFor(1.78)).toBe(45);
  });
});
