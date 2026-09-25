import { describe, expect, it } from "vitest";
import { calculateMaterialTakeoff, type MaterialTakeoffInput } from "./materialCalculator";

// Golden W07. GIB is an interior lining: an exterior wall is lined on its
// inside face only, an interior wall on the faces asked for. With one
// "sides" setting for the whole run, a whole-house scan said "both sides"
// and every metre of exterior wall was GIB-lined on the outside too.

const q = (input: MaterialTakeoffInput, id: string) =>
  calculateMaterialTakeoff(input).materials.find((m) => m.id === id)?.quantity;

const HOUSE: MaterialTakeoffInput = {
  wallLengthM: 52.8,
  exteriorWallLengthM: 36,
  wallHeightM: 2.4,
  numberOfDoors: 5,
  numberOfWindows: 6,
  gibSides: 2,
  includeInsulation: false,
};

describe("GIB lines the inside of exterior walls and both faces of interior walls (golden W07)", () => {
  it("52.8 m run, 36 m of it exterior, 'both sides': 56 sheets (was 84 — the outside of 36 m of wall lined too)", () => {
    // Openings share the run like the insulation does (17.004 m² × 36/52.8 on
    // exterior walls): exterior 86.4 − 11.5936 = 74.8064 m² × 1 face; interior
    // 40.32 − 5.4104 = 34.9096 m² × 2 faces = 69.8193 m²; 144.6256 × 1.1 ÷ 2.88
    // = 55.24 → 56 sheets.
    expect(q(HOUSE, "gib-10mm")).toBe(56);
    expect(q(HOUSE, "gib-screws")).toBe(2464); // 56 × 40 × 1.1
    expect(q(HOUSE, "gib-adhesive")).toBe(14); // 56 ÷ 4
  });

  it("a wall run that is all exterior is lined on the inside only, even when 'both sides' is said", () => {
    // 12 × 2.4 − 2 windows (2.88) = 25.92 m² × 1 face × 1.1 ÷ 2.88 = 9.9 → 10
    const input = { wallLengthM: 12, exteriorWallLengthM: 12, wallHeightM: 2.4, numberOfWindows: 2, includeInsulation: false };
    expect(q({ ...input, gibSides: 2 }, "gib-10mm")).toBe(10);
    expect(q({ ...input, gibSides: 1 }, "gib-10mm")).toBe(10);
  });

  it("an all-interior run (exterior run 0) keeps both faces", () => {
    // 10 × 2.4 = 24 m² × 2 faces × 1.1 ÷ 2.88 = 18.33 → 19
    expect(q({ wallLengthM: 10, exteriorWallLengthM: 0, wallHeightM: 2.4, gibSides: 2, includeInsulation: false }, "gib-10mm")).toBe(19);
  });

  it("with no exterior run known nothing changes: the sides asked for apply to the whole run", () => {
    expect(q({ wallLengthM: 10, wallHeightM: 2.4, gibSides: 2, includeInsulation: false }, "gib-10mm")).toBe(19);
    expect(q({ ...HOUSE, exteriorWallLengthM: undefined }, "gib-10mm")).toBe(84);
  });

  it("GIB one side is unchanged: every metre lined once", () => {
    // (52.8 × 2.4 − 17.004) = 109.716 m² × 1.1 ÷ 2.88 = 41.9 → 42
    expect(q({ ...HOUSE, gibSides: 1 }, "gib-10mm")).toBe(42);
    expect(q({ ...HOUSE, gibSides: 1, exteriorWallLengthM: undefined }, "gib-10mm")).toBe(42);
  });

  it("skirting and architraves follow the lined faces too", () => {
    const trims = { ...HOUSE, includeSkirting: true, includeArchitraves: true };
    // Doors share the run: 5 × 36/52.8 = 3.409 on exterior walls, 1.591 inside.
    // Skirting (36 − 3.409 × 0.82) × 1 + (16.8 − 1.591 × 0.82) × 2 = 33.2045 + 30.9909
    // = 64.1955 m × 1.1 ÷ 4.8 = 14.71 → 15 (was (52.8 − 4.1) × 2 = 97.4 m → 23)
    expect(q(trims, "skirting")).toBe(15);
    // Architraves 4.9 m a door: 3.409 × 4.9 × 1 + 1.591 × 4.9 × 2 = 16.705 + 15.591
    // = 32.295 m × 1.1 ÷ 4.8 = 7.4 → 8 (was 5 × 4.9 × 2 = 49 m → 12)
    expect(q(trims, "architraves")).toBe(8);
  });
});
