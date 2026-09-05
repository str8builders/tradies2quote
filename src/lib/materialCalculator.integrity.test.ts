import { describe, expect, it } from "vitest";
import { calculateMaterialTakeoff, calculateDeckTakeoff, calculateCladdingTakeoff, calculateSubfloorTakeoff } from "./materialCalculator";

describe("invalid takeoffs cannot produce purchasing quantities", () => {
  for (const invalid of [NaN, Infinity, -1, 0]) {
    it(`blocks invalid divisors: ${invalid}`, () => {
      const results = [
        calculateMaterialTakeoff({ wallLengthM: 6, gibSheetWidthM: invalid }),
        calculateDeckTakeoff({ deckLengthM: 6, deckWidthM: 4, joistSpacingMm: invalid }),
        calculateCladdingTakeoff({ wallLengthM: 6, claddingCoverageMm: invalid }),
        calculateSubfloorTakeoff({ floorLengthM: 6, floorWidthM: 4, timberStockLengthM: invalid }),
      ];
      for (const result of results) {
        expect(result.materials).toEqual([]);
        expect(result.warnings.length).toBeGreaterThan(0);
        expect(Object.values(result.summary).every(Number.isFinite)).toBe(true);
      }
    });
  }

  it("does not round wall area down before ordering whole sheets", () => {
    const result = calculateMaterialTakeoff({ wallLengthM: 1.2001, wallHeightM: 2.4,
      gibSides: 1, wastePercent: 0, includeInsulation: false });
    // 2.88024 m² cannot fit on one 2.88 m² sheet, despite rounding to 2.88 for display.
    expect(result.materials.find(m => m.id === "gib-10mm")?.quantity).toBe(2);
  });

  it("does not create a framing kit for a zero-length wall", () => {
    expect(calculateMaterialTakeoff({ wallLengthM: 0 }).materials).toEqual([]);
  });
});
