import { describe, expect, it } from "vitest";
import { extractFromText } from "../extraction";
import { concreteVolumeM3, slabVolumeM3 } from "../normalise";
import { runTakeoff } from "../orchestrator";

// Golden CO02 / CO04. The concrete order is volume × (1 + waste) rounded UP
// ONCE to the supplier's 0.1 m³ — the calculator rounded the slab volume up
// first (2.01 → 2.1) and then the order again (2.1 × 1.05 = 2.205 → 2.3,
// not 2.1105 → 2.2). And a stated slab thickness was never read ("150
// thick"), so every slab was quoted at the 100 mm default.

const concrete = (text: string) => runTakeoff(text).scopes.find((s) => s.scope === "concrete");
const volume = (text: string) => concrete(text)?.lines.find((l) => l.id === "concrete-volume")?.quantity;

describe("the concrete order is rounded up once (golden CO02)", () => {
  it("slabVolumeM3 is exact; concreteVolumeM3 still pads to 0.1 m³ for its own callers", () => {
    expect(slabVolumeM3(6.7, 3, 100)).toBeCloseTo(2.01, 10);
    expect(concreteVolumeM3(6.7, 3, 100)).toBe(2.1);
  });

  it("6.7 × 3 × 100 mm: 2.01 m³ × 1.05 = 2.1105 → 2.2 m³ (was 2.3)", () => {
    expect(volume("Concrete pad 6.7 x 3, 100 thick.")).toBe(2.2);
  });

  it("a slab that lands on a tenth isn't pushed up a tenth: 6 × 4 × 100 mm × 1.05 = 2.52 → 2.6", () => {
    expect(volume("Pour a concrete slab 6 by 4, 100 thick.")).toBe(2.6);
  });
});

describe("the slab thickness the tradie states is used (golden CO04)", () => {
  it("reads the thickness in mm into the concrete scope (its height_m, as the clarify question does)", () => {
    const t = (text: string) => extractFromText(text, "concrete").dimensions.height_m;
    expect(t("Workshop slab 8 by 3.5, 150 thick.")).toBe(150);
    expect(t("Slab 8 by 3.5, 150mm thick")).toBe(150);
    expect(t("Slab 8 by 3.5, 15cm thick")).toBe(150);
    expect(t("Slab 8 by 3.5, 0.15m thick")).toBe(150);
    expect(t("Slab 8 by 3.5, thickness 125mm")).toBe(125);
    expect(t("Slab 8 by 3.5")).toBeNull();
  });

  it("8 × 3.5 × 150 mm: 4.2 m³ × 1.05 = 4.41 → 4.5 m³ (was 3.0 at the 100 mm default)", () => {
    const text = "Workshop slab 8 by 3.5, 150 thick.";
    expect(volume(text)).toBe(4.5);
    expect(concrete(text)?.assumptions.join(" ")).not.toMatch(/Assumed slab thickness/);
  });

  it("a thickness that can't be a slab is not read — the default is used and flagged", () => {
    const text = "Slab 6 by 4, 1500 thick.";
    expect(extractFromText(text, "concrete").dimensions.height_m).toBeNull();
    expect(concrete(text)?.assumptions.join(" ")).toMatch(/Assumed slab thickness 100mm/);
  });
});
