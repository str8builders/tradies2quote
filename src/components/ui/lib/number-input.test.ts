import { describe, expect, it } from "vitest";
import {
  applyPadKey,
  currencySymbol,
  padKeyFromKeyboard,
  padValueToNumber,
  sanitizeDecimalInput,
  type PadKey,
} from "./number-input";

const type = (keys: PadKey[], rules?: Parameters<typeof applyPadKey>[2], start = "") =>
  keys.reduce((value, key) => applyPadKey(value, key, rules), start);

describe("number pad input rules", () => {
  it("types digits in order", () => {
    expect(type(["3", ".", "8", "5"])).toBe("3.85");
    expect(type(["1", "2", "4", "0"])).toBe("1240");
  });

  it("never keeps a leading zero", () => {
    expect(type(["0", "5"])).toBe("5");
    expect(type(["0", "0", "0"])).toBe("0");
    expect(type(["0", ".", "5"])).toBe("0.5");
  });

  it("a point on an empty value becomes 0.", () => {
    expect(type(["."])).toBe("0.");
    expect(type([".", "5"])).toBe("0.5");
  });

  it("allows only one decimal point", () => {
    expect(type(["1", ".", ".", "5", "."])).toBe("1.5");
  });

  it("stops at two decimal places by default", () => {
    expect(type(["9", ".", "9", "9", "9"])).toBe("9.99");
  });

  it("whole-number pads ignore the point", () => {
    expect(type(["4", ".", "2"], { decimals: 0 })).toBe("42");
  });

  it("caps the digits before the point", () => {
    expect(type(["1", "2", "3", "4"], { maxIntegerDigits: 3 })).toBe("123");
    // …but decimals can still be added.
    expect(type(["1", "2", "3", ".", "4"], { maxIntegerDigits: 3 })).toBe("123.4");
  });

  it("backspace removes the last character, down to empty", () => {
    expect(type(["backspace"], undefined, "3.85")).toBe("3.8");
    expect(type(["backspace", "backspace"], undefined, "3.8")).toBe("3");
    expect(type(["backspace", "backspace"], undefined, "0.")).toBe("");
    expect(type(["backspace"])).toBe("");
  });

  it("clear empties the value", () => {
    expect(type(["clear"], undefined, "1240.5")).toBe("");
  });

  it("maps keyboard keys", () => {
    expect(padKeyFromKeyboard("7")).toBe("7");
    expect(padKeyFromKeyboard(".")).toBe(".");
    expect(padKeyFromKeyboard(",")).toBe(".");
    expect(padKeyFromKeyboard("Backspace")).toBe("backspace");
    expect(padKeyFromKeyboard("Delete")).toBe("clear");
    expect(padKeyFromKeyboard("a")).toBeNull();
    expect(padKeyFromKeyboard("Enter")).toBeNull();
  });

  it("reads the typed value as a number", () => {
    expect(padValueToNumber("")).toBeNull();
    expect(padValueToNumber(".")).toBeNull();
    expect(padValueToNumber("0.")).toBe(0);
    expect(padValueToNumber("3.85")).toBe(3.85);
    expect(padValueToNumber("12.")).toBe(12);
  });
});

describe("sanitizeDecimalInput (typed or pasted text)", () => {
  it("strips currency symbols, spaces and thousands commas", () => {
    expect(sanitizeDecimalInput("$1,240.50")).toBe("1240.50");
    expect(sanitizeDecimalInput(" 1 240 ")).toBe("1240");
    expect(sanitizeDecimalInput("1,240")).toBe("1240");
  });
  it("treats a single short comma group as a decimal comma", () => {
    expect(sanitizeDecimalInput("12,5")).toBe("12.5");
    expect(sanitizeDecimalInput("3,85")).toBe("3.85");
  });
  it("drops extra points and extra decimals", () => {
    expect(sanitizeDecimalInput("1.2.3")).toBe("1.23");
    expect(sanitizeDecimalInput("9.999")).toBe("9.99");
  });
  it("removes leading zeros and completes a bare point", () => {
    expect(sanitizeDecimalInput("007")).toBe("7");
    expect(sanitizeDecimalInput("0")).toBe("0");
    expect(sanitizeDecimalInput(".5")).toBe("0.5");
    expect(sanitizeDecimalInput("abc")).toBe("");
  });
  it("respects whole-number fields and the integer cap", () => {
    expect(sanitizeDecimalInput("12.5", { decimals: 0 })).toBe("12");
    expect(sanitizeDecimalInput("123456789", { maxIntegerDigits: 4 })).toBe("1234");
  });
});

describe("currencySymbol", () => {
  it("uses the app's own money formatter", () => {
    expect(currencySymbol("NZD")).toBe("$");
    expect(currencySymbol("AUD")).toBe("$");
    expect(currencySymbol("GBP")).toBe("£");
  });
});
