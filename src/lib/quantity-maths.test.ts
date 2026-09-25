import { describe, expect, it } from "vitest";
import { round2, safeCeil } from "./quantity-maths";
import { round2 as moneyRound2 } from "./quote-defaults";

describe("quantity-maths — the one rounding module every calculator imports", () => {
  it("round2 is exact half-up at the half-cent boundaries", () => {
    expect(round2(0.125)).toBe(0.13);
    expect(round2(1.005)).toBe(1.01); // plain Math.round gave 1.00
    expect(round2(2.01 * 0.5)).toBe(1.01); // stored as 1.00499999999999989…
    expect(round2(10.075)).toBe(10.08); // plain Math.round gave 10.07
    expect(round2(-1.005)).toBe(-1.01);
  });

  it("round2 strips float noise instead of rounding it up or down", () => {
    expect(round2(22.000000004)).toBe(22);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("round2 is the same function as the money round2 (one rule for quantities and cents)", () => {
    for (const v of [0.125, 1.005, 2.675, 1234.565, -0.005, 99.995]) {
      expect(round2(v)).toBe(moneyRound2(v));
    }
  });

  it("round2 maps non-finite input to 0", () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("safeCeil ignores float noise but not real fractions", () => {
    expect(safeCeil(22.000000004)).toBe(22); // plain Math.ceil gives 23
    expect(safeCeil(19 * 40 * 1.1)).toBe(836); // 836.0000000000001
    expect(safeCeil((3.2 * 3) / 4.8)).toBe(2); // 2.0000000000000004
    expect(safeCeil(22.0001)).toBe(23);
    expect(safeCeil(0)).toBe(0);
    expect(safeCeil(Number.NaN)).toBe(0);
  });
});
