import { describe, expect, it } from "vitest";
import { frameMembers, memberBounds, studXs } from "../canvas/frame";
import { shotAt } from "../timeline";
import { WALL } from "../layout";

describe("the dawn frame is framed like a real NZ wall", () => {
  it("studs sit at 600 centres from end to end of the 7.2 m wall", () => {
    const xs = studXs();
    expect(xs).toHaveLength(13);
    expect(xs[0]).toBe(WALL.x0);
    expect(xs[12]).toBe(3.6);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeCloseTo(0.6, 9);
    expect(xs).toContain(0);
    expect(xs).toContain(0.6);
  });

  it("every member is a real length of timber", () => {
    for (const m of frameMembers()) {
      const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]);
      expect(len).toBeGreaterThan(0.05);
      expect(len).toBeLessThan(8);
    }
  });

  it("the camera walks through the stud bay and into the phone without touching a single member", () => {
    const boxes = frameMembers().map(memberBounds);
    const margin = 0.06; // the lens's near plane plus a little air
    const samples: Array<readonly [number, number, number]> = [];
    for (let i = 0; i <= 600; i++) samples.push(shotAt({ scene: "site", t: i / 600 }).pos);
    for (let i = 0; i <= 200; i++) samples.push(shotAt({ scene: "portal", t: i / 200 }).pos);
    const hits: string[] = [];
    for (const p of samples) {
      for (const b of boxes) {
        const inside =
          p[0] > b.min[0] - margin && p[0] < b.max[0] + margin &&
          p[1] > b.min[1] - margin && p[1] < b.max[1] + margin &&
          p[2] > b.min[2] - margin && p[2] < b.max[2] + margin;
        if (inside) hits.push(`camera at ${p.map((n) => n.toFixed(2)).join(", ")} hits timber`);
      }
    }
    expect(hits).toEqual([]);
  });
});
