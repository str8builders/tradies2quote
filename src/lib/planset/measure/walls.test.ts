import { describe, expect, it } from "vitest";
import type { FillShape } from "../types";
import { readWalls } from "./walls";
import { alignSheets } from "./align";

/** A filled wall strip, page mm, drawn at 1:100 (90 mm = 0.9 page mm). */
const strip = (x0: number, y0: number, x1: number, y1: number, c = "#3f3f3f"): FillShape => ({
  c,
  pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
  bbox: [x0, y0, x1, y1],
});

/**
 * A 10 m × 8 m box of 90 mm walls with a 1.2 m window gap in the top wall,
 * one internal wall across the middle, and a title-block frame far away.
 */
function house(): FillShape[] {
  const t = 0.9;
  return [
    strip(10, 10, 40, 10 + t), // top wall, left of the window
    strip(52, 10, 110, 10 + t), // top wall, right of the 12 mm (1.2 m) gap
    strip(10, 90 - t, 110, 90), // bottom
    strip(10, 10, 10 + t, 90), // left
    strip(110 - t, 10, 110, 90), // right
    strip(60, 10 + t, 60 + t, 90 - t, "#7f7f7f"), // internal
    strip(0, 280, 400, 281, "#000000"), // title-block frame
  ];
}

describe("readWalls", () => {
  it("joins pieces into walls, keeps the opening and finds the outside", () => {
    const w = readWalls(house(), { ratio: 100 });
    expect(w.lines.every((l) => l.thicknessMm === 90)).toBe(true);
    const top = w.lines.find((l) => l.orientation === "h" && l.at < 20)!;
    expect(top.gaps).toEqual([{ from: 40, to: 52, widthMm: 1200 }]);
    expect(top.lengthMm).toBe(10000);
    expect(top.external).toBe(true);
    const internal = w.lines.find((l) => l.colour === "#7f7f7f")!;
    expect(internal.external).toBe(false);
    // 2 × (10 m + 8 m) of outside wall; the 7.82 m internal wall.
    expect(w.externalLengthMm).toBe(36000);
    expect(w.internalLengthMm).toBe(7820);
    // Inside the outside face: 10 × 8 = 80 m².
    expect(w.enclosedAreaM2).toBeGreaterThan(79.4);
    expect(w.enclosedAreaM2).toBeLessThan(80.6);
  });

  it("drops shapes that aren't part of the building", () => {
    const w = readWalls(house(), { ratio: 100 });
    expect(w.pieces.some((p) => p.colour === "#000000")).toBe(false);
    expect(w.extent).toEqual([10, 10, 110, 90]);
  });

  it("ignores strips too thin or too thick to be framing at this scale", () => {
    const w = readWalls([strip(10, 10, 60, 10.2), strip(10, 20, 60, 25)], { ratio: 100 });
    expect(w.pieces).toEqual([]);
  });
});

describe("alignSheets", () => {
  it("finds the shift between two sheets drawing the same plan", () => {
    const a = Array.from({ length: 30 }, (_, i) => strip(10 + i * 3, 10, 12 + i * 3, 10.9));
    const b = a.map((f) => strip(f.bbox[0] + 4.1, f.bbox[1] - 15.6, f.bbox[2] + 4.1, f.bbox[3] - 15.6));
    expect(alignSheets(a, b)).toMatchObject({ dx: 4.1, dy: -15.6, matches: 30, share: 1 });
  });
  it("refuses sheets that don't share a drawing", () => {
    const a = Array.from({ length: 30 }, (_, i) => strip(10 + i * 3, 10, 12 + i * 3, 10.9));
    const b = Array.from({ length: 30 }, (_, i) => strip(10, 10 + i * 5, 10.9, 14 + i * 5));
    expect(alignSheets(a, b)).toBeNull();
  });
});
