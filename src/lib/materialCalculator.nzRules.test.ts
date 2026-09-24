import { describe, expect, it } from "vitest";
import {
  calculateMaterialTakeoff,
  type MaterialTakeoffInput,
  type MaterialTakeoffResult,
} from "./materialCalculator";

// ─────────────────────────────────────────────────────────────────────────
// The wall calculator's NZ rules, each checked against a simple hand
// calculation a builder would do on the back of a docket. Stock 4.8 m,
// GIB 2400 × 1200 (2.88 m²), 10% waste unless stated.
// ─────────────────────────────────────────────────────────────────────────

function q(r: MaterialTakeoffResult, id: string): number | undefined {
  return r.materials.find((m) => m.id === id)?.quantity;
}

function calc(input: Partial<MaterialTakeoffInput>): MaterialTakeoffResult {
  return calculateMaterialTakeoff({
    wallLengthM: 10,
    wallHeightM: 2.4,
    gibSides: 2,
    ...input,
  } as MaterialTakeoffInput);
}

describe("studs at 600 mm centres, both ends included", () => {
  it.each([
    // 3.6 m: studs at 0, 0.6 … 3.6 → 7
    [3.6, 600, 7],
    // 4.0 m: 0 … 3.6 plus the end stud at 4.0 → 8
    [4.0, 600, 8],
    // 10 m: ceil(10000 / 600) = 17 bays → 18 studs
    [10, 600, 18],
    // 4.0 m at 400: 10 bays → 11 studs
    [4.0, 400, 11],
  ])("%s m at %s mm → %s studs", (len, spacing, studs) => {
    expect(q(calc({ wallLengthM: len, studSpacingMm: spacing }), "studs-90x45")).toBe(studs);
  });

  it("each door / window adds 4 studs (trimmers + jacks)", () => {
    const r = calc({ wallLengthM: 10, numberOfDoors: 1, numberOfWindows: 1 });
    expect(q(r, "studs-90x45")).toBe(18 + 8);
  });
});

describe("plates: bottom + top + cap = 3 rows", () => {
  it("10 m wall: 30 m of plate ÷ 4.8 = 6.25 → 7 lengths", () => {
    expect(q(calc({ wallLengthM: 10 }), "plates-90x45")).toBe(7);
  });

  it("3.2 m wall: 9.6 m of plate is exactly 2 × 4.8 m lengths (no float round-up to 3)", () => {
    expect(q(calc({ wallLengthM: 3.2 }), "plates-90x45")).toBe(2);
  });

  it("1.6 m wall: 4.8 m of plate is exactly 1 length", () => {
    expect(q(calc({ wallLengthM: 1.6 }), "plates-90x45")).toBe(1);
  });
});

describe("GIB sheets per side (2400 × 1200 = 2.88 m²)", () => {
  it("10 m × 2.4 m, ONE side: 24 m² × 1.1 ÷ 2.88 = 9.17 → 10 sheets", () => {
    expect(q(calc({ gibSides: 1 }), "gib-10mm")).toBe(10);
  });

  it("10 m × 2.4 m, BOTH sides: 48 m² × 1.1 ÷ 2.88 = 18.33 → 19 sheets", () => {
    expect(q(calc({ gibSides: 2 }), "gib-10mm")).toBe(19);
  });

  it("openings come off each lined side: 1 door (0.82 × 2.04) both sides", () => {
    // (24 − 1.6728) × 2 × 1.1 ÷ 2.88 = 17.06 → 18
    expect(q(calc({ gibSides: 2, numberOfDoors: 1 }), "gib-10mm")).toBe(18);
  });
});

describe("GIB screws: 40 per sheet + 10%", () => {
  it("19 sheets → 19 × 44 = 836 screws (no float round-up to 837)", () => {
    expect(q(calc({ gibSides: 2 }), "gib-screws")).toBe(836);
  });

  it("20 sheets → 880 screws", () => {
    // 10.9 m × 2.4 × 2 × 1.1 ÷ 2.88 = 19.98 → 20 sheets
    const r = calc({ wallLengthM: 10.9 });
    expect(q(r, "gib-10mm")).toBe(20);
    expect(q(r, "gib-screws")).toBe(880);
  });

  it("adhesive: 1 tube per 4 sheets → 19 sheets = 5 tubes", () => {
    expect(q(calc({ gibSides: 2 }), "gib-adhesive")).toBe(5);
  });
});

describe("dwangs (nogs): one row per 1.35 m of stud height, max", () => {
  it("2.4 m wall → 1 row: 10 m ÷ 4.8 = 2.08 → 3 lengths", () => {
    expect(q(calc({ wallHeightM: 2.4 }), "nogs-90x45")).toBe(3);
  });

  it("2.7 m wall → still 1 row (2.7 ÷ 1.35 = 2 bays exactly)", () => {
    expect(q(calc({ wallHeightM: 2.7 }), "nogs-90x45")).toBe(3);
  });

  it("3.0 m wall → 2 rows: 20 m ÷ 4.8 = 4.17 → 5 lengths", () => {
    expect(q(calc({ wallHeightM: 3.0 }), "nogs-90x45")).toBe(5);
  });

  it("16.8 m wall at 2.4 m stock → exactly 7 lengths (no float round-up)", () => {
    expect(
      q(calc({ wallLengthM: 16.8, timberStockLengthM: 2.4 }), "nogs-90x45"),
    ).toBe(7);
  });
});

describe("insulation (exterior walls only), in m²", () => {
  it("20 m exterior × 2.4 m = 48 m² × 1.1 ÷ 8.8 m²/pack = 6 packs", () => {
    const r = calc({ wallLengthM: 40, exteriorWallLengthM: 20, includeInsulation: true });
    expect(q(r, "pink-batts")).toBe(6);
  });

  it("10 m × 2.4 m = 24 m² × 1.1 = 26.4 m² ÷ 6.6 m² packs = exactly 4 (no float round-up to 5)", () => {
    const r = calc({
      exteriorWallLengthM: 10,
      includeInsulation: true,
      insulationPackCoverageM2: 6.6,
    });
    expect(q(r, "pink-batts")).toBe(4);
  });

  it("exterior openings come off the insulated area", () => {
    // 10 m, all exterior, 2 windows 1.2 × 1.2: (24 − 2.88) × 1.1 ÷ 8.8 = 2.64 → 3
    const r = calc({ exteriorWallLengthM: 10, numberOfWindows: 2, includeInsulation: true });
    expect(q(r, "pink-batts")).toBe(3);
  });
});

describe("skirting and architraves, with waste", () => {
  it("skirting runs both lined faces, less the door openings", () => {
    // (10 − 3 × 0.82) × 2 faces = 15.08 m × 1.1 = 16.59 m ÷ 4.8 = 3.46 → 4
    const r = calc({ numberOfDoors: 3, includeSkirting: true });
    expect(q(r, "skirting")).toBe(4);
  });

  it("skirting, no doors, one face: 10 m × 1.1 ÷ 4.8 = 2.29 → 3", () => {
    expect(q(calc({ gibSides: 1, includeSkirting: true }), "skirting")).toBe(3);
  });

  it("skirting 24 m, both faces: 48 m × 1.1 = 52.8 m ÷ 4.8 = exactly 11 lengths", () => {
    expect(q(calc({ wallLengthM: 24, includeSkirting: true }), "skirting")).toBe(11);
  });

  it("architraves go on BOTH faces of a door in a wall lined both sides", () => {
    // per face: 2 × 2.04 + 0.82 = 4.90 m; 2 faces × 1.1 = 10.78 m ÷ 4.8 = 2.25 → 3
    const r = calc({ numberOfDoors: 1, includeArchitraves: true });
    expect(q(r, "architraves")).toBe(3);
  });

  it("architraves, wall lined one side: one face → 4.9 × 1.1 ÷ 4.8 = 1.12 → 2", () => {
    const r = calc({ gibSides: 1, numberOfDoors: 1, includeArchitraves: true });
    expect(q(r, "architraves")).toBe(2);
  });
});
