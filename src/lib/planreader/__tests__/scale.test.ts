import { describe, expect, it } from "vitest";
import { parseScale } from "../scale";

describe("parseScale", () => {
  it("parses a common metric ratio with high confidence", () => {
    const r = parseScale("1:100");
    expect(r.system).toBe("metric");
    expect(r.mm_per_drawing_unit).toBe(100);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("parses a spaced ratio", () => {
    expect(parseScale("Scale 1 : 50").mm_per_drawing_unit).toBe(50);
  });

  it("flags an uncommon ratio with lower confidence", () => {
    const r = parseScale("1:73");
    expect(r.mm_per_drawing_unit).toBe(73);
    expect(r.confidence).toBeLessThan(0.9);
    expect(r.notes.join(" ")).toMatch(/uncommon/i);
  });

  it("parses an imperial scale", () => {
    const r = parseScale('1/4" = 1\'-0"');
    expect(r.system).toBe("imperial");
    expect(r.mm_per_drawing_unit).toBeCloseTo(304.8 / 0.25, 1);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("returns confidence 0 for NTS (forbids pixel measurement)", () => {
    const r = parseScale("NTS");
    expect(r.confidence).toBe(0);
    expect(r.mm_per_drawing_unit).toBeNull();
  });

  it("returns confidence 0 for not-to-scale prose", () => {
    expect(parseScale("Not To Scale").confidence).toBe(0);
  });

  it("returns confidence 0 for empty / unparseable input", () => {
    expect(parseScale(null).confidence).toBe(0);
    expect(parseScale("").confidence).toBe(0);
    expect(parseScale("garbage text").confidence).toBe(0);
  });

  // Audit 2026-09-24: dates and clock times are not scales.
  it("does not read a date or a time as a ratio", () => {
    expect(parseScale("1:20/08/2026").confidence).toBe(0);
    expect(parseScale("1:20.08.2026").confidence).toBe(0);
    expect(parseScale("1:30 pm").confidence).toBe(0);
    expect(parseScale("1:30:00").confidence).toBe(0);
  });

  it("still parses a ratio at the end of a sentence or before a sheet size", () => {
    expect(parseScale("Drawn at 1:100.").mm_per_drawing_unit).toBe(100);
    expect(parseScale("1:50 @ A3").mm_per_drawing_unit).toBe(50);
  });
});
