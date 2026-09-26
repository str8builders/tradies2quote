import { describe, expect, it } from "vitest";
import { DEMO_BARCODE, ean13, ean13CheckDigit, ean13Modules } from "./ean13";

describe("EAN-13 for the barcode screen", () => {
  it("computes check digits like the standard (a published example code)", () => {
    expect(ean13CheckDigit("400638133393")).toBe(1);
    expect(ean13("400638133393")).toBe("4006381333931");
  });

  it("draws 95 modules with the start, centre and end guards", () => {
    const m = ean13Modules("4006381333931");
    expect(m).toHaveLength(95);
    expect(m.slice(0, 3)).toBe("101");
    expect(m.slice(45, 50)).toBe("01010");
    expect(m.slice(92)).toBe("101");
    expect(() => ean13Modules("4006381333932")).toThrow();
  });

  it("uses an in-store code (200–299), never a real product's", () => {
    expect(DEMO_BARCODE).toMatch(/^2\d{12}$/);
    expect(Number(DEMO_BARCODE.slice(0, 3))).toBeGreaterThanOrEqual(200);
    expect(Number(DEMO_BARCODE.slice(0, 3))).toBeLessThanOrEqual(299);
    expect(ean13Modules(DEMO_BARCODE)).toHaveLength(95);
  });
});
