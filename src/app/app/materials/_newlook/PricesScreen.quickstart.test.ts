import { describe, expect, it } from "vitest";
import { quickStartBody, quickStartTitle } from "./PricesScreen";

describe("quick start's note on the Prices screen", () => {
  it("counts only what it added", () => {
    expect(quickStartTitle(9)).toBe("Added 9 prices");
    expect(quickStartTitle(1)).toBe("Added 1 price");
    expect(quickStartTitle(0)).toBe("Nothing new to add");
  });
  it("says plainly what was already there", () => {
    expect(quickStartBody({ added: 9, already: 4 })).toBe("4 were already in your list. Quotes use the new prices instead of an estimate.");
    expect(quickStartBody({ added: 13, already: 0 })).toBe("Quotes use them instead of an estimate.");
    expect(quickStartBody({ added: 0, already: 1 })).toBe("1 was already in your list.");
  });
});
