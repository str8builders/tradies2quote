import { describe, expect, it } from "vitest";
import { readDimension } from "./aiTakeoffParser";

// One unit-inference rule for every dimension kind the takeoff reads:
//   - an explicit mm / cm / m (or m² / mm²) suffix is always honoured;
//   - a bare length / height / width / span ≥ 100 is millimetres
//     (NZ plans and tradies drop the "mm": "2400 high" = 2.4 m);
//   - spacings and thicknesses come out in mm ("600 centres" = 600 mm);
//   - areas come out in m²;
//   - `plausible` is false when the converted value is outside the kind's
//     sane band, so callers flag it for review instead of computing.
describe("readDimension", () => {
  it.each([
    ["2400", undefined, 2.4],
    ["2400", "mm", 2.4],
    ["240", "cm", 2.4],
    ["2.4", "m", 2.4],
    ["2.4", undefined, 2.4],
    ["2.7", "metres", 2.7],
    ["2,700", "millimetres", 2.7],
  ])("height %s %s → %s m", (value, unit, expected) => {
    const r = readDimension(value, unit, "height");
    expect(r?.value).toBe(expected);
    expect(r?.unit).toBe("m");
    expect(r?.plausible).toBe(true);
  });

  it("marks whether the unit was written or inferred", () => {
    expect(readDimension("2400", undefined, "height")?.unitInferred).toBe(true);
    expect(readDimension("2400", "mm", "height")?.unitInferred).toBe(false);
  });

  it.each([
    ["4800", undefined, 4.8],
    ["10", undefined, 10],
    ["10", "m", 10],
    ["12500", "mm", 12.5],
    ["99", undefined, 99],
  ])("length %s %s → %s m", (value, unit, expected) => {
    expect(readDimension(value, unit, "length")?.value).toBe(expected);
  });

  it.each([
    ["3600", undefined, 3.6],
    ["3.82", "m", 3.82],
    ["382", "cm", 3.82],
  ])("width %s %s → %s m", (value, unit, expected) => {
    expect(readDimension(value, unit, "width")?.value).toBe(expected);
  });

  it.each([
    ["1800", undefined, 1.8],
    ["1.8", "m", 1.8],
    ["2400", "mm", 2.4],
  ])("span %s %s → %s m", (value, unit, expected) => {
    expect(readDimension(value, unit, "span")?.value).toBe(expected);
  });

  it.each([
    ["90", undefined, 90],
    ["140", "mm", 140],
    ["1.4", "cm", 14],
    ["0.1", "m", 100],
  ])("thickness %s %s → %s mm", (value, unit, expected) => {
    const r = readDimension(value, unit, "thickness");
    expect(r?.value).toBe(expected);
    expect(r?.unit).toBe("mm");
  });

  it.each([
    ["600", undefined, 600],
    ["450", "mm", 450],
    ["0.6", "m", 600],
    ["0.6", undefined, 600],
    ["60", "cm", 600],
  ])("spacing %s %s → %s mm ('600 centres' = 600 mm)", (value, unit, expected) => {
    const r = readDimension(value, unit, "spacing");
    expect(r?.value).toBe(expected);
    expect(r?.unit).toBe("mm");
  });

  it.each([
    ["24", "m2", 24],
    ["24", "m²", 24],
    ["24", "square metres", 24],
    ["24", "sqm", 24],
    ["24", undefined, 24],
    ["24000000", "mm2", 24],
  ])("area %s %s → %s m²", (value, unit, expected) => {
    const r = readDimension(value, unit, "area");
    expect(r?.value).toBe(expected);
    expect(r?.unit).toBe("m²");
  });

  it("the wall-run kind keeps whole-house totals in metres (bare < 1000)", () => {
    expect(readDimension("120", undefined, "run")?.value).toBe(120);
    expect(readDimension("52000", undefined, "run")?.value).toBe(52);
    expect(readDimension("52", "m", "run")?.value).toBe(52);
  });

  it.each([
    ["24", undefined, "height"],
    ["2400", "m", "height"],
    ["240", undefined, "height"],
    ["450", "m", "length"],
    ["50", "mm", "length"],
    ["60", undefined, "spacing"],
    ["2", "m", "spacing"],
    ["5001", "m2", "area"],
    ["1500", "m", "run"],
  ] as const)("implausible after conversion: %s %s (%s)", (value, unit, kind) => {
    const r = readDimension(value, unit, kind);
    expect(r).toBeDefined();
    expect(r!.plausible).toBe(false);
  });

  it("rejects non-numbers and units that don't fit the kind", () => {
    expect(readDimension("abc", undefined, "length")).toBeUndefined();
    expect(readDimension("0", "m", "length")).toBeUndefined();
    expect(readDimension("24", "m2", "length")).toBeUndefined();
    expect(readDimension("2.4", "m", "area")).toBeUndefined();
  });

  it("converted values carry no float noise", () => {
    expect(readDimension("0.45", "m", "spacing")?.value).toBe(450);
    expect(readDimension("3820", "mm", "width")?.value).toBe(3.82);
    expect(readDimension("1.1", "m", "thickness")?.value).toBe(1100);
  });
});
