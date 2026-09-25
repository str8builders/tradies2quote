import { describe, expect, it } from "vitest";
import {
  areaM2,
  boardCoverageMm,
  concreteVolumeM3,
  materialFamily,
  memberCountAlong,
  roofAreaFromPitch,
  safeCeil,
  sheetsForArea,
  stockLengthsForLM,
  toMetres,
  toMillimetres,
} from "../normalise";

describe("normalise — unit conversions", () => {
  it("toMetres respects explicit unit", () => {
    expect(toMetres(4.8, "m")).toBe(4.8);
    expect(toMetres(4800, "mm")).toBe(4.8);
    expect(toMetres(480, "cm")).toBe(4.8);
  });

  it("toMetres reads unitless values by the shared bare-number rule (≥ 100 is mm, below is metres)", () => {
    expect(toMetres(4800)).toBe(4.8);
    expect(toMetres(7.2)).toBe(7.2);
    expect(toMetres(62)).toBe(62); // the old "> 50 means mm" clamp made this 0.062
  });

  it("toMillimetres round-trips", () => {
    expect(toMillimetres(4.8, "m")).toBe(4800);
    expect(toMillimetres(4800, "mm")).toBe(4800);
  });

  it("safeCeil ignores IEEE noise", () => {
    expect(safeCeil(22.0000000004)).toBe(22);
    expect(safeCeil(22.0001)).toBe(23);
  });
});

describe("normalise — geometry helpers", () => {
  it("areaM2", () => {
    expect(areaM2(4.8, 3)).toBeCloseTo(14.4, 2);
  });

  it("memberCountAlong counts end-inclusive", () => {
    // 6m / 600mm = 10 spaces + 1 closing member = 11
    expect(memberCountAlong(6, 600)).toBe(11);
  });

  it("boardCoverageMm subtracts lap, adds gap", () => {
    expect(boardCoverageMm({ nominalWidthMm: 90, gapMm: 5 })).toBe(95);
    expect(boardCoverageMm({ nominalWidthMm: 180, lapMm: 30 })).toBe(150);
  });

  it("stockLengthsForLM rounds up", () => {
    // 25m / 4.8m = 5.2 → 6 (no waste)
    expect(stockLengthsForLM(25, 4.8, 0)).toBe(6);
    // 25m + 10% = 27.5 / 4.8 = 5.73 → 6
    expect(stockLengthsForLM(25, 4.8, 10)).toBe(6);
  });

  it("sheetsForArea handles waste %", () => {
    // 20m² / 2.88 (1.2×2.4) = 6.94 → 7; with 10% waste → 22/2.88 = 7.64 → 8
    expect(sheetsForArea(20, 1.2, 2.4, 0)).toBe(7);
    expect(sheetsForArea(20, 1.2, 2.4, 10)).toBe(8);
  });

  it("roofAreaFromPitch scales by 1/cos", () => {
    expect(roofAreaFromPitch(100, 0)).toBe(100);
    expect(roofAreaFromPitch(100, 30)).toBeCloseTo(115.47, 1);
  });

  it("concreteVolumeM3 rounds up to nearest 0.1 m³", () => {
    expect(concreteVolumeM3(5, 4, 100)).toBe(2);
    expect(concreteVolumeM3(5.1, 4, 100)).toBe(2.1);
  });
});

describe("normalise — material family", () => {
  it("classifies common NZ materials", () => {
    expect(materialFamily("10mm GIB Board")).toBe("lining");
    expect(materialFamily("Pink Batts R2.2")).toBe("insulation");
    expect(materialFamily("200x50 H3.2 SG8 Joist")).toBe("timber-structural");
    expect(materialFamily("180mm bevel-back weatherboard")).toBe("cladding");
    expect(materialFamily("Reinforcing mesh SE62")).toBe("concrete");
    expect(materialFamily("Roofing screws")).toBe("fixing");
    expect(materialFamily("Random thing")).toBe("generic");
  });
});
