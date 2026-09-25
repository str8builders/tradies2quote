import { describe, expect, it } from "vitest";
import { extractStatedCounts, isStatedCount } from "../statedCounts";

describe("extractStatedCounts — counts the tradie says for materials", () => {
  it("reads '<n> sheets / boxes / lengths' and '<n> x item'", () => {
    const got = extractStatedCounts(
      "Supply and fix 14 sheets of 10mm GIB, 2 boxes of screws, 30 lengths of 90x45 and 6 x posts.",
    ).sort((a, b) => a - b);
    expect(got).toEqual([2, 6, 14, 30]);
  });

  it("ignores sizes, rates and prices", () => {
    expect(
      extractStatedCounts("Wall 6 m long, 2.4 high, 90 x 45 studs at 600 centres, 90x45 studs, 1.5 sheets short, $31.50 a sheet, 2 days."),
    ).toEqual([]);
  });

  it("isStatedCount matches the exact quantity only", () => {
    expect(isStatedCount(14, [2, 14])).toBe(true);
    expect(isStatedCount(15, [2, 14])).toBe(false);
    expect(isStatedCount(0, [0])).toBe(false);
  });
});
