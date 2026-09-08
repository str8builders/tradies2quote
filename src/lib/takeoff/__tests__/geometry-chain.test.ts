import { describe, expect, it } from "vitest";
import {
  geometryPreamble,
  sanitisePlan,
} from "@/lib/scan-drawing";
import { extractFromText } from "../extraction";

// ─────────────────────────────────────────────────────────────────────────
// Regression guard for the load-bearing hand-off: a non-rectangular footprint
// → deterministic geometry → the text the route injects into `dimensions` →
// the takeoff extractor that area-based calculators read. This previously
// silently broke: the injected "m²" / "perimeter = N m" text didn't match the
// extractAreaM2 / extractPerimeterM regexes, so composite area never reached
// the calculator (it fell back to the bounding box).
// ─────────────────────────────────────────────────────────────────────────

describe("scan geometry → takeoff text chain", () => {
  it("an L-shape's composite area reaches extractFromText (area scope)", () => {
    // L-shape: a 6×8 leg + a 4×3 leg = 48 + 12 = 60 m² (bounding box would be
    // 10×8 = 80). The real footprint must come through as 60, not 80.
    const plan = sanitisePlan({
      shape: "l_shape",
      width_m: 10,
      length_m: 8,
      regions: [
        { width_m: 6, length_m: 8 },
        { width_m: 4, length_m: 3 },
      ],
    });
    expect(plan?.area_m2).toBe(60);

    const preamble = geometryPreamble(plan);
    expect(preamble).toContain("m²"); // keeps the pretty superscript

    // roofing/lining/insulation all require area_m2 — check one.
    const extracted = extractFromText(preamble, "roofing");
    expect(extracted.dimensions.area_m2).toBe(60);
  });

  it("a circle's area + perimeter both reach extractFromText", () => {
    const plan = sanitisePlan({
      shape: "circle",
      width_m: 4,
      length_m: 4,
      radius_m: 2,
    });
    const preamble = geometryPreamble(plan);
    const extracted = extractFromText(preamble, "concrete");
    // πr² ≈ 12.57, circumference ≈ 12.57.
    expect(extracted.dimensions.area_m2).toBeCloseTo(12.57, 1);
    expect(extracted.dimensions.perimeter_m).toBeCloseTo(12.57, 1);
  });

  it("the bare extractAreaM2 path accepts the m² superscript", () => {
    // Guard the regex fix directly via the public extractor.
    expect(extractFromText("Computed area = 30 m² (Triangle)", "lining").dimensions.area_m2).toBe(30);
    // And the legacy m2 / sqm forms still work.
    expect(extractFromText("area is 25 m2", "lining").dimensions.area_m2).toBe(25);
    expect(extractFromText("18 sqm of wall", "lining").dimensions.area_m2).toBe(18);
  });

  it("a plain rectangle emits no preamble (unchanged path)", () => {
    const plan = sanitisePlan({ shape: "rect", width_m: 6, length_m: 8 });
    expect(geometryPreamble(plan)).toBe("");
  });

  it("keeps line/fence plans when width is omitted", () => {
    const plan = sanitisePlan({ shape: "line", length_m: 24 });
    expect(plan?.shape).toBe("line");
    expect(plan?.width_m).toBe(0);
    expect(plan?.length_m).toBe(24);
  });
});
