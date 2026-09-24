import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote-defaults";
import { isUnpricedLine } from "@/lib/quote-validation";
import { lineConfidence } from "@/lib/lineConfidence";
import { scannedMaterialLine } from "./barcodeLine";

const sealant = {
  id: "7b0c9d5e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
  name: "Sikaflex 11FC grey 300ml",
  unit: "each",
  default_unit_price: 14.35,
};

describe("scannedMaterialLine — a scanned library item as a quote line", () => {
  it("adds one of it at the tradie's own library price, linked to the library item", () => {
    expect(scannedMaterialLine(sealant)).toEqual({
      type: "material",
      description: "Sikaflex 11FC grey 300ml",
      quantity: 1,
      unit: "each",
      unit_price: 14.35,
      line_total: 14.35,
      library_id: sealant.id,
      is_ai_estimated: false,
      is_missing_price: false,
      price_source: "user_library",
      price_confidence: "high",
    });
  });

  it("keeps the library's unit and full-precision price", () => {
    const line = scannedMaterialLine({ ...sealant, unit: "box", default_unit_price: 0.125 });
    expect(line.unit).toBe("box");
    expect(line.unit_price).toBe(0.125);
    expect(line.line_total).toBe(0.13);
  });

  it("falls back to 'each' when the library item has no unit", () => {
    expect(scannedMaterialLine({ ...sealant, unit: null }).unit).toBe("each");
    expect(scannedMaterialLine({ ...sealant, unit: "  " }).unit).toBe("each");
  });

  it("marks an item with no saved price as missing a price, never as priced at $0", () => {
    const line = scannedMaterialLine({ ...sealant, default_unit_price: null });
    expect(line).toMatchObject({ unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price" });
    expect(line).not.toHaveProperty("price_confidence");
    expect(isUnpricedLine(line)).toBe(true);
    expect(lineConfidence(line)).toBe("low");
  });

  it("counts in the materials subtotal exactly like a line added by hand", () => {
    const scanned = scannedMaterialLine(sealant);
    const manual = { type: "material" as const, description: "Sikaflex 11FC grey 300ml", quantity: 1, unit: "each", unit_price: 14.35, line_total: 14.35 };
    expect(computeQuoteTotals([scanned], 20, 15)).toEqual(computeQuoteTotals([manual], 20, 15));
    expect(isUnpricedLine(scanned)).toBe(false);
    expect(lineConfidence(scanned)).toBe("high");
  });
});
