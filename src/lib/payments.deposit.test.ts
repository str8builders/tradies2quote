import { describe, expect, it } from "vitest";
import { depositCents } from "./payments";

// Golden M09. Stripe charges the deposit in integer cents. It was computed
// as Math.round(totalCents × pct / 100) in floating point, where
// 163,850 × 0.35 = 57,347.49999999999 — so a 573.475 deposit (an exact half
// cent) rounded DOWN to $573.47. Every other money figure in the app rounds
// half-up (quote-defaults.round2).

describe("depositCents — integer cents, exact half-up", () => {
  it("35 % of $1,638.50 = 573.475 → 57,348 c (was 57,347)", () => {
    expect(depositCents(1638.5, 35)).toBe(57348);
  });

  it("70 % of $1,638.45 = 1,146.915 → 114,692 c (was 114,691)", () => {
    expect(depositCents(1638.45, 70)).toBe(114692);
  });

  it("half-cents round up, other fractions to the nearest cent", () => {
    expect(depositCents(3109.77, 50)).toBe(155489); // 1,554.885 → 1,554.89
    expect(depositCents(2933.33, 10)).toBe(29333); // 293.333 → 293.33
    expect(depositCents(12204.46, 30)).toBe(366134); // 3,661.338 → 3,661.34
    expect(depositCents(0.01, 50)).toBe(1); // 0.005 → 0.01
  });

  it("a fractional percentage is exact too: 12.5 % of $100.04 = 12.505 → 1,251 c", () => {
    expect(depositCents(100.04, 12.5)).toBe(1251);
  });

  it("clamps the percentage to 0–100 and never goes negative", () => {
    expect(depositCents(214.48, 100)).toBe(21448);
    expect(depositCents(214.48, 120)).toBe(21448);
    expect(depositCents(214.48, 0)).toBe(0);
    expect(depositCents(214.48, -5)).toBe(0);
    expect(depositCents(-50, 50)).toBe(0);
    expect(depositCents(Number.NaN, 50)).toBe(0);
  });
});
