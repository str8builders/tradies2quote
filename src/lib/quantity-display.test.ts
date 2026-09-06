import { describe, expect, it } from "vitest";
import { formatQuantity, formatUnitPrice } from "./quantity-display";

describe("takeoff quantity presentation", () => {
  it("keeps small orders, whole counts and invalid values distinct", () => {
    expect(formatQuantity(0.000237504404611388)).toBe("0.000238");
    expect(formatQuantity(0.000000000000025)).toBe("2.5e-14");
    expect(formatQuantity(22)).toBe("22");
    expect(formatQuantity(0)).toBe("0");
    expect(formatQuantity(NaN)).toBe("—");
  });

  it("retains enough digits to reproduce the extended cents at every tested rate", () => {
    for (const quantity of [0.237504404611388, 1 / 3, 0.000000002372, 1299999.9999999998]) {
      for (const rate of [0, 0.3333333333333333, 400, 9850.01, 1e6, 1e12]) {
        const displayed = Number(formatQuantity(quantity, rate));
        expect(Math.round(displayed * rate * 100)).toBe(Math.round(quantity * rate * 100));
        expect(displayed).toBeGreaterThan(0);
      }
    }
  });

  it("preserves fractions of a cent in unit prices", () => {
    expect(formatUnitPrice(0.123456789012345, "NZD")).toBe("$0.123456789012345");
    expect(formatUnitPrice(400, "NZD")).toBe("$400.00");
    expect(formatUnitPrice(2e-25, "NZD")).toBe("2e-25 NZD");
  });
});
