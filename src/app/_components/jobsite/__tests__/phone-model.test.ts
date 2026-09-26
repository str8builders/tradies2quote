import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Box3 } from "three";
import { describe, expect, it } from "vitest";
import { BODY, BODY_ASPECT, EDGE, SCREEN, bodyGeometries, screenGeometry } from "../canvas/phone-model";

describe("the floating phone's shape", () => {
  it("has the demo screen's proportions, so the step clips fit it exactly", () => {
    // The clips are Remotion's 390 × 844 phone screen (780 × 1688, then 600 and 420 wide).
    expect(SCREEN.width / SCREEN.height).toBeCloseTo(390 / 844, 12);
  });

  it("spreads the clip over the whole screen, corner to corner", () => {
    const g = screenGeometry();
    const uv = g.getAttribute("uv");
    const pos = g.getAttribute("position");
    let [minU, maxU, minV, maxV] = [1, 0, 1, 0];
    for (let i = 0; i < uv.count; i++) {
      const [u, v] = [uv.getX(i), uv.getY(i)];
      [minU, maxU, minV, maxV] = [Math.min(minU, u), Math.max(maxU, u), Math.min(minV, v), Math.max(maxV, v)];
      expect(u).toBeCloseTo(pos.getX(i) / SCREEN.width + 0.5, 6);
      expect(v).toBeCloseTo(pos.getY(i) / SCREEN.height + 0.5, 6);
    }
    expect([minU, maxU, minV, maxV].map((n) => Math.round(n * 1e6) / 1e6)).toEqual([0, 1, 0, 1]);
    g.dispose();
  });

  it("is shaped like a real phone, with the screen on the flat glass inside the rounded edge", () => {
    expect(BODY_ASPECT).toBeGreaterThan(0.47);
    expect(BODY_ASPECT).toBeLessThan(0.5);
    expect(BODY.depth / BODY.height).toBeCloseTo(8.25 / 146.6, 2);
    expect(SCREEN.width).toBeLessThan(BODY.width - 2 * EDGE.size);
    expect(SCREEN.height).toBeLessThan(BODY.height - 2 * EDGE.size);
  });

  it("builds the body to size, with flat glass on both faces", () => {
    const { front, back, edge } = bodyGeometries();
    const box = new Box3().setFromBufferAttribute(edge.getAttribute("position") as never);
    expect(box.max.x - box.min.x).toBeCloseTo(BODY.width, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(BODY.height, 6);
    expect(box.max.z - box.min.z).toBeCloseTo(BODY.depth, 6);
    expect(box.max.z).toBeCloseTo(BODY.depth / 2, 6);
    for (const [g, z] of [[front, 1], [back, -1]] as const) {
      const n = g.getAttribute("normal");
      expect(n.count).toBeGreaterThan(0);
      for (let i = 0; i < n.count; i++) expect(n.getZ(i)).toBeCloseTo(z, 6);
    }
    // The edge is one smooth surface (shared vertices), so the metal shades without facets.
    expect(edge.getIndex()).not.toBeNull();
    [front, back, edge].forEach((g) => g.dispose());
  });

  it("matches the page's phone slot, so the 3D phone and the drawn one are the same size", () => {
    const css = readFileSync(join(process.cwd(), "src/app/_components/jobsite/jobsite.css"), "utf8");
    const slotAspect = BODY_ASPECT.toFixed(4);
    expect(slotAspect).toBe("0.4848");
    expect(css).toContain(`100cqh * ${slotAspect}`);
    expect(css).toContain(`aspect-ratio: ${slotAspect}`);
  });
});
