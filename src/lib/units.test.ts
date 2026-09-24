import { describe, expect, it } from "vitest";
import {
  convertUnitPrice,
  isDayUnit,
  isHourUnit,
  normaliseUnit,
  unitsCompatible,
} from "./units";

describe("normaliseUnit", () => {
  it("recognises synonyms and superscripts", () => {
    expect(normaliseUnit("m²")).toEqual(normaliseUnit("sqm"));
    expect(normaliseUnit("M2")).toEqual(normaliseUnit("square metres"));
    expect(normaliseUnit("lm")).toEqual(normaliseUnit("m"));
    expect(normaliseUnit("ea")).toEqual(normaliseUnit("each"));
    expect(normaliseUnit("No.")).toEqual(normaliseUnit("each"));
    expect(normaliseUnit("per m")).toEqual(normaliseUnit("m"));
  });

  it("returns null for blank or unknown units (never 'compatible')", () => {
    expect(normaliseUnit("")).toBeNull();
    expect(normaliseUnit(null)).toBeNull();
    expect(normaliseUnit("widgets")).toBeNull();
  });

  it("labour units", () => {
    expect(isHourUnit("hour")).toBe(true);
    expect(isHourUnit("hrs")).toBe(true);
    expect(isHourUnit("day")).toBe(false);
    expect(isDayUnit("days")).toBe(true);
    expect(isHourUnit("lot")).toBe(false);
  });
});

describe("convertUnitPrice — a price is only moved between compatible units", () => {
  it("same unit (or synonym) → unchanged", () => {
    expect(convertUnitPrice(30, "sheet", "sheets")).toBe(30);
    expect(convertUnitPrice(12.5, "m", "lm")).toBe(12.5);
    expect(convertUnitPrice(9.99, null, "each")).toBe(9.99); // null library unit = each
  });

  it("never applies a per-sheet price to m², nor a per-pack price to m²", () => {
    expect(convertUnitPrice(30, "sheet", "m²")).toBeNull();
    expect(convertUnitPrice(95, "pack", "m2")).toBeNull();
    expect(unitsCompatible("sheet", "m²")).toBe(false);
  });

  it("hours and days never convert (a working day varies)", () => {
    expect(convertUnitPrice(75, "hour", "day")).toBeNull();
  });

  it("converts exactly within a dimension", () => {
    expect(convertUnitPrice(0.05, "mm", "m")).toBe(50);
    expect(convertUnitPrice(12, "L", "L")).toBe(12);
    expect(convertUnitPrice(2, "g", "kg")).toBe(2000);
  });

  it("refuses a conversion that would leave a sub-cent unit price", () => {
    // $12.34/m → $0.01234/mm can't be carried at cents.
    expect(convertUnitPrice(12.34, "m", "mm")).toBeNull();
    expect(convertUnitPrice(10, "m", "ft")).toBeNull();
  });

  it("unknown line unit → null", () => {
    expect(convertUnitPrice(10, "each", "")).toBeNull();
    expect(convertUnitPrice(10, "each", "widgets")).toBeNull();
  });
});
