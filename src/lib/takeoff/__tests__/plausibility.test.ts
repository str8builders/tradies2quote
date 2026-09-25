import { describe, expect, it } from "vitest";
import {
  BARE_MM_FROM,
  METRES_BANDS,
  bareLengthToMetres,
  checkMetres,
  isPlausibleMetres,
} from "../plausibility";

describe("the shared metres plausibility rule", () => {
  it("takes an in-band value exactly as stated", () => {
    expect(checkMetres("Cladding wall length", 62, "edge")).toEqual({ ok: true, value: 62 });
    expect(checkMetres("Total wall run", 480, "wallRun")).toEqual({ ok: true, value: 480 });
    expect(checkMetres("Wall height", 2.7, "wallHeight")).toEqual({ ok: true, value: 2.7 });
  });

  it("refuses an out-of-band value with a plain reason, suggesting mm only when that reading fits", () => {
    expect(checkMetres("Deck length", 4800, "edge")).toEqual({
      ok: false,
      reason: "Deck length 4800 m is more than 100 m — check it. If you meant 4800 mm, that's 4.8 m.",
    });
    expect(checkMetres("Wall height", 2400, "wallHeight")).toEqual({
      ok: false,
      reason: "Wall height 2400 m is more than 6 m — check it. If you meant 2400 mm, that's 2.4 m.",
    });
    // 24 m as mm would be 0.024 m — not a wall height either, so no mm hint.
    expect(checkMetres("Wall height", 24, "wallHeight")).toEqual({
      ok: false,
      reason: "Wall height 24 m is more than 6 m — check it.",
    });
    expect(checkMetres("Deck width", 0.05, "edge")).toEqual({
      ok: false,
      reason: "Deck width 0.05 m is less than 0.1 m — check it.",
    });
    expect(checkMetres("Deck width", undefined, "edge")).toEqual({ ok: false, reason: "Deck width is missing." });
    expect(checkMetres("Deck width", -3, "edge")).toEqual({
      ok: false,
      reason: "Deck width must be a number of metres above 0.",
    });
  });

  it("band edges are inclusive", () => {
    expect(isPlausibleMetres(METRES_BANDS.edge.max, "edge")).toBe(true);
    expect(isPlausibleMetres(100.01, "edge")).toBe(false);
    expect(isPlausibleMetres(METRES_BANDS.wallHeight.min, "wallHeight")).toBe(true);
    expect(isPlausibleMetres(1.79, "wallHeight")).toBe(false);
  });

  it("bare numbers: 100 or more is millimetres, smaller is metres as stated", () => {
    expect(BARE_MM_FROM).toBe(100);
    expect(bareLengthToMetres(4800)).toBe(4.8);
    expect(bareLengthToMetres(100)).toBe(0.1);
    expect(bareLengthToMetres(62)).toBe(62);
    expect(bareLengthToMetres(99.9)).toBe(99.9);
    expect(bareLengthToMetres(0)).toBeNaN();
  });
});
