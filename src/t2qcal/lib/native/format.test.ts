import { describe, expect, it } from "vitest";
import reference from "../fixtures/native-reference.json";
import { amount, ceilInt, floorInt, money, num, quantity, roundedInt, ulp } from "./format";

describe("native Fmt port", () => {
  it("formats like NSNumberFormatter en_NZ decimal with half-up rounding", () => {
    expect(num(3247.2)).toBe("3,247.2");
    expect(num(1234567.891, 2)).toBe("1,234,567.89");
    expect(num(0.125, 2)).toBe("0.13");
    expect(num(-0.004, 2)).toBe("0");
    expect(num(2.5, 0)).toBe("3");
    expect(num(NaN)).toBe("0");
    expect(money(1164)).toBe("$1,164");
    expect(amount(334.6)).toBe("334.60");
    expect(quantity(3.734253)).toBe("3.734253");
  });
  it("mirrors the integer guards", () => {
    expect(roundedInt(2.5, 0, 10)).toBe(3);
    expect(roundedInt(-2.5, -10, 10)).toBe(-3);
    expect(ceilInt(3.0000000000000004, 0, 100)).toBe(3);
    expect(ceilInt(3.001, 0, 100)).toBe(4);
    expect(floorInt(2.9999999999999996, 0, 100)).toBe(3);
    expect(ulp(1)).toBe(Number.EPSILON);
    expect(ulp(1024)).toBe(1024 * Number.EPSILON);
  });
  it("reproduces every native result value that is a plain number with unit", () => {
    // Every "<number> <unit>" result in the reference must be re-printable by
    // num() from its parsed value at the digit count it shows — proves the
    // formatter matches the native one across 570 cases.
    const cases = (reference as unknown as { cases: { results: { value: string }[] }[] }).cases;
    let checked = 0;
    for (const c of cases) for (const r of c.results) {
      const m = /^(-?[\d,]+(?:\.\d+)?)( .*)?$/.exec(r.value);
      if (!m) continue;
      // A whole number of 1,000+ printed without grouping came from a raw
      // integer interpolation in the native code, not from Fmt.num.
      if (!m[1].includes(",") && Math.abs(Number(m[1].replace(/,/g, ""))) >= 1000) continue;
      // More than 12 decimals is a raw Double print (Fmt.quantity fallback), not Fmt.num.
      if (m[1].includes(".") && m[1].split(".")[1].length > 12) continue;
      const digits = m[1].includes(".") ? m[1].split(".")[1].length : 0;
      expect(num(Number(m[1].replace(/,/g, "")), digits) + (m[2] ?? "")).toBe(r.value);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(1500);
  });
});
