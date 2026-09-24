import { describe, expect, it } from "vitest";
import { concreteVolumeM3 } from "../normalise";
import { runConcreteCalculator } from "../calculators/concrete";
import type { ExtractedExtraction } from "../schemas";

// Float noise must never add a unit when a quantity is rounded UP:
// 2 × 1.5 × 0.1 = 0.30000000000000004 m³ is 0.3 m³, not 0.4 m³, and
// 6 m³ × 1.05 = 6.300000000000001 m³ is 6.3 m³, not 6.4 m³.

function concreteExt(
  dimensions: ExtractedExtraction["dimensions"],
  waste_percent: number | null = null,
): ExtractedExtraction {
  return {
    confidence: 1,
    project_type: null,
    scope_type: "concrete",
    sub_scopes: [],
    dimensions,
    openings: [],
    waste_percent,
    notes: [],
    needs_clarification: [],
    clarification_questions: [],
    source_basis: "manual",
  };
}

describe("concrete round-ups carry no float noise", () => {
  it.each([
    [2, 1.5, 100, 0.3],
    [2.5, 1.2, 200, 0.6],
    [2.5, 2.4, 200, 1.2],
    [5, 4, 100, 2],
    [5.1, 4, 100, 2.1],
  ])("slab %s m × %s m × %s mm → %s m³", (l, w, t, expected) => {
    expect(concreteVolumeM3(l, w, t)).toBe(expected);
  });

  it.each([
    [6, 5, 6.3],
    [7, 10, 7.7],
    [18, 5, 18.9],
    [19, 10, 20.9],
  ])("order: %s m³ plus %s percent waste → %s m³", (volume, waste, expected) => {
    const r = runConcreteCalculator(concreteExt({ volume_m3: volume }, waste));
    const line = r.lines.find((l) => l.id === "concrete-volume");
    expect(line?.quantity).toBe(expected);
  });
});
