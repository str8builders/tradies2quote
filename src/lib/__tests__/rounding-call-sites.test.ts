import { describe, expect, it } from "vitest";
import { calculateDeckTakeoff } from "../materialCalculator";
import { areaM2, round2 as normaliseRound2 } from "../takeoff/normalise";
import { computePlanGeometry } from "../takeoff/geometry";
import {
  parseSupplierQuoteExtraction,
  toExGst,
} from "../materials/quoteExtraction";
import { mergeExtractions, type ScanPage } from "../materials/mergeExtractions";

// Audit item 7 — every quantity / area / money rounding goes through ONE
// exact half-up helper. Plain `Math.round(n * 100) / 100` rounds a half-cent
// DOWN whenever the double sits a hair below it: 2.01 × 0.5 is stored as
// 1.00499999999999989…, so it came out 1.00 instead of 1.01.

describe("area rounding is exact half-up in every calculator", () => {
  it("a 2.01 m × 0.5 m deck is 1.01 m² (was 1.00)", () => {
    expect(calculateDeckTakeoff({ deckLengthM: 2.01, deckWidthM: 0.5 }).summary.wallAreaM2).toBe(1.01);
  });

  it("normalise.areaM2(2.01, 0.5) is 1.01 m² (was 1.00)", () => {
    expect(areaM2(2.01, 0.5)).toBe(1.01);
  });

  it("normalise.round2 rounds 1.005 to 1.01 (was 1.00) and 4.35 × 0.5 to 2.18 (was 2.17)", () => {
    expect(normaliseRound2(1.005)).toBe(1.01);
    expect(normaliseRound2(4.35 * 0.5)).toBe(2.18);
  });

  it("scanned-plan geometry: a 2.01 × 0.5 region is 1.01 m² (was 1.00)", () => {
    const geo = computePlanGeometry({
      shape: "l_shape",
      width_m: 3,
      length_m: 3,
      regions: [{ width_m: 2.01, length_m: 0.5, label: null }],
    });
    expect(geo.area_m2).toBe(1.01);
  });
});

describe("supplier-quote money rounding is exact half-up", () => {
  it("a printed line total of 1.005 is kept as $1.01 (was $1.00)", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "Tek screws", unit: "each", price: 1.005, quantity: 1, line_total: 1.005 }],
    });
    if (!r.ok) throw new Error("parse failed");
    expect(r.value.items[0].source_line_total).toBe(1.01);
  });

  it("toExGst on an ex-GST 1.005 gives $1.01 (was $1.00)", () => {
    expect(toExGst(1.005, false)).toBe(1.01);
  });

  it("two photo pages printing $0.50 and $0.505 sum to $1.01 (was $1.00)", () => {
    const page = (subtotal: number, name: string): ScanPage => ({
      supplier: "ITM",
      currency: "NZD",
      gst_inclusive: false,
      items: [{ name, unit: "each", price: subtotal, quantity: 1, sku: null, confidence: 1 }],
      subtotal,
      notes: [],
    });
    expect(mergeExtractions([page(0.5, "A"), page(0.505, "B")]).subtotal).toBe(1.01);
  });
});
