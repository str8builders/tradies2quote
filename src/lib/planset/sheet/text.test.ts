import { describe, expect, it } from "vitest";
import { isHorizontal, isVertical, parseDimensionLabel, parseSizePair, textBox, textCentre } from "./text";

describe("parseDimensionLabel", () => {
  it.each([
    ["6,470", 6470, false],
    ["15440", 15440, false],
    ["90", 90, false],
    ["3600 ±", 3600, true],
    ["± 2000", 2000, true],
    ["4850 approx", 4850, true],
    ["18,210", 18210, false],
  ])("%s → %d mm", (raw, mm, approx) => {
    expect(parseDimensionLabel(raw)).toEqual({ mm, approx });
  });

  it.each(["1:100", "8/08/2025", "A02.3", "R2.8", "2.4", "90x45", "L16:300x90", "01", "5", "1,2345", "12:30", ""])(
    "%s is not a dimension",
    (raw) => {
      expect(parseDimensionLabel(raw)).toBeNull();
    },
  );
});

describe("parseSizePair", () => {
  it("reads schedule sizes in mm, width first", () => {
    expect(parseSizePair("715×1,415")).toEqual({ widthMm: 715, heightMm: 1415 });
    expect(parseSizePair("1415x715")).toEqual({ widthMm: 1415, heightMm: 715 });
    expect(parseSizePair("1800 x 1200")).toEqual({ widthMm: 1800, heightMm: 1200 });
  });
  it("reads metre sizes printed on plans", () => {
    expect(parseSizePair("2.4 x 3.0")).toEqual({ widthMm: 2400, heightMm: 3000 });
    expect(parseSizePair("1.2x2.2")).toEqual({ widthMm: 1200, heightMm: 2200 });
  });
  it("rejects timber sizes and nonsense", () => {
    expect(parseSizePair("90x45")).toBeNull();
    expect(parseSizePair("W01")).toBeNull();
  });
});

describe("text geometry", () => {
  it("finds the middle of horizontal and upward text", () => {
    const [cx, cy] = textCentre({ x: 10, y: 20, angle: 0, h: 3, w: 12 });
    expect(cx).toBeCloseTo(16);
    expect(cy).toBeCloseTo(19);
    const [vx, vy] = textCentre({ x: 10, y: 20, angle: 90, h: 3, w: 12 });
    expect(vx).toBeCloseTo(9);
    expect(vy).toBeCloseTo(14);
    expect(textBox({ x: 10, y: 20, angle: 0, h: 3, w: 12 })).toEqual([10, 17, 22, 20]);
  });
  it("classifies reading directions", () => {
    expect(isHorizontal(0)).toBe(true);
    expect(isHorizontal(180)).toBe(true);
    expect(isVertical(90)).toBe(true);
    expect(isVertical(270)).toBe(true);
    expect(isHorizontal(45)).toBe(false);
  });
});
