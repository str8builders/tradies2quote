import { describe, expect, it } from "vitest";
import { FADE_FROM, ROOM_HOLD, blendSlots, containIn, walkAt, type Box } from "../house-walk";

const VH = 800;
const ROOMS = 5;
/**
 * Each room's top on screen, `y` px after the first room reached the top.
 * Room sections are ROOM_HOLD + 1 screens tall and overlap by one screen
 * (jobsite.css), so each starts ROOM_HOLD screens after the one before.
 */
const topsAt = (y: number) => Array.from({ length: ROOMS }, (_, i) => i * ROOM_HOLD * VH - y);
const walk = (y: number) => walkAt(topsAt(y), VH);

describe("walkAt — which room you're in, and how far each has faded in", () => {
  it("nothing plays until the first room is more than half way up the screen", () => {
    expect(walk(-VH)).toEqual({ enter: [0, 0, 0, 0, 0], active: -1 });
    expect(walk(-VH / 2).active).toBe(-1);
    expect(walk(-VH / 2 + 8).active).toBe(0);
    expect(walk(0).enter[0]).toBe(1);
  });

  it("the next room fades in over the end of the room before it, and takes over when it's filled the screen", () => {
    const hold = ROOM_HOLD * VH;
    expect(walk(hold * FADE_FROM - 1).enter[1]).toBe(0);
    expect(walk(hold * FADE_FROM + 20).enter[1]).toBeGreaterThan(0);
    expect(walk(hold * FADE_FROM + 20).active).toBe(0);
    expect(walk(hold)).toMatchObject({ active: 1 });
    expect(walk(hold).enter[1]).toBe(1);
  });

  it("walks every room in order, never skipping or going back, with no jumps", () => {
    const seen: number[] = [];
    let last = walk(-VH);
    for (let y = -VH; y <= ROOM_HOLD * VH * ROOMS; y += 4) {
      const now = walk(y);
      expect(now.active).toBeGreaterThanOrEqual(last.active);
      // A smoothstep over the 0.28 × 1.3 screens of a fade moves at most ~0.02 per 4 px; a jump would be far more.
      now.enter.forEach((e, i) => expect(Math.abs(e - last.enter[i])).toBeLessThan(0.03));
      if (seen[seen.length - 1] !== now.active) seen.push(now.active);
      last = now;
    }
    expect(seen).toEqual([-1, 0, 1, 2, 3, 4]);
  });
});

describe("blendSlots — where the phone floats", () => {
  const slot = (left: number, top: number): Box => ({ left, top, width: 150, height: 300 });

  it("sits on the first room's slot until the next room fades in", () => {
    expect(blendSlots([slot(200, 400), slot(210, 380)], [1, 0])).toEqual(slot(200, 400));
    expect(blendSlots([slot(200, 400), slot(210, 380)], [1, 1])).toEqual(slot(210, 380));
    expect(blendSlots([], [])).toBeNull();
  });

  it("never jumps at a hand-over, even when the incoming room is still settling", () => {
    // The incoming room's pin is scaled up a touch while it fades in, so its
    // slot sits a few px off until it has arrived.
    let last = blendSlots([slot(200, 400), slot(206, 392)], [1, 0]);
    for (let k = 0; k <= 1; k += 0.01) {
      const now = blendSlots([slot(200, 400), slot(206 - 6 * k, 392 + 8 * k)], [1, k]);
      expect(now).not.toBeNull();
      expect(Math.abs(now!.left - last!.left)).toBeLessThan(0.3);
      expect(Math.abs(now!.top - last!.top)).toBeLessThan(0.3);
      last = now;
    }
  });
});

describe("containIn — the phone fits its slot without stretching", () => {
  const aspect = 0.4848;
  it("fills the height of a wide slot and the width of a narrow one, centred", () => {
    const wide = containIn({ left: 0, top: 100, width: 400, height: 300 }, aspect);
    expect(wide.height).toBe(300);
    expect(wide.width / wide.height).toBeCloseTo(aspect, 9);
    expect(wide.left + wide.width / 2).toBeCloseTo(200, 9);
    const narrow = containIn({ left: 10, top: 0, width: 100, height: 600 }, aspect);
    expect(narrow.width).toBeCloseTo(100, 9);
    expect(narrow.top + narrow.height / 2).toBeCloseTo(300, 9);
  });

  it("can stand at the bottom of its slot instead, so it doesn't move when a room's words are longer", () => {
    const short = containIn({ left: 0, top: 200, width: 150, height: 460 }, aspect, "bottom");
    const long = containIn({ left: 0, top: 240, width: 150, height: 420 }, aspect, "bottom");
    expect(short.top + short.height).toBe(660);
    expect(short).toEqual(long);
  });

  it("an empty slot gives an empty phone", () => {
    expect(containIn({ left: 0, top: 0, width: 0, height: 0 }, aspect).height).toBe(0);
  });
});
