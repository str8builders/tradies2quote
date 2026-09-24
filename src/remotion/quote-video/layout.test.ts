import { describe, expect, it } from "vitest";
import { estimateLines, fitDisplaySize, logoBox, moneyFontSize, totalTextAt } from "./layout";
import { QUOTE_VIDEO_COMPOSITION, QUOTE_VIDEO_POSTER_FRAME, QUOTE_VIDEO_TIMELINE as T } from "../../lib/quote-video/constants";

const TOTAL = { value: 4830, text: "$4,830.00", currency: "NZD" };

describe("the total count-up", () => {
  it("starts at zero and climbs through the count", () => {
    expect(totalTextAt(0, TOTAL)).toBe("$0.00");
    expect(totalTextAt(T.countStart, TOTAL)).toBe("$0.00");
    const mid = totalTextAt(Math.round((T.countStart + T.countEnd) / 2), TOTAL);
    expect(mid).not.toBe("$0.00");
    expect(mid).not.toBe(TOTAL.text);
  });

  it("shows the exact figure on every frame from the landing to the last frame", () => {
    for (let frame = T.countEnd; frame < QUOTE_VIDEO_COMPOSITION.durationInFrames; frame++) {
      expect(totalTextAt(frame, TOTAL)).toBe(TOTAL.text);
    }
  });

  it("lands inside the total scene, and the poster frame shows the exact total", () => {
    expect(T.countStart).toBeGreaterThanOrEqual(T.total.from);
    expect(T.countEnd).toBeLessThan(T.accept.from);
    expect(QUOTE_VIDEO_POSTER_FRAME).toBeGreaterThanOrEqual(T.countEnd);
    expect(totalTextAt(QUOTE_VIDEO_POSTER_FRAME, TOTAL)).toBe(TOTAL.text);
  });

  it("uses the pre-formatted text even where the formatter would round differently", () => {
    const odd = { value: 1234.5, text: "£1,234.50", currency: "GBP" };
    expect(totalTextAt(T.countEnd, odd)).toBe("£1,234.50");
    expect(totalTextAt(T.countEnd - 1, odd)).toMatch(/^£/);
  });

  it("never counts past the final figure", () => {
    for (let frame = T.countStart; frame < T.countEnd; frame++) {
      const shown = Number(totalTextAt(frame, TOTAL).replace(/[^0-9.]/g, ""));
      expect(shown).toBeLessThanOrEqual(TOTAL.value);
    }
  });
});

describe("text sizing", () => {
  it("keeps long totals on one line of the 608 px content width", () => {
    for (const text of ["$4,830.00", "$1,234,567.89", "£98,765.43", "$0.00"]) {
      const size = moneyFontSize(text, 600);
      expect(size).toBeGreaterThanOrEqual(40);
      expect(size).toBeLessThanOrEqual(132);
    }
    expect(moneyFontSize("$1,234,567.89", 600)).toBeLessThan(moneyFontSize("$4,830.00", 600));
  });

  it("fits display text within its line budget", () => {
    const size = fitDisplaySize("WHAKATĀNE HERITAGE RESTORATION & JOINERY", { max: 92, min: 34, width: 608, maxLines: 3 });
    expect(estimateLines("WHAKATĀNE HERITAGE RESTORATION & JOINERY", size, 608)).toBeLessThanOrEqual(3);
    expect(fitDisplaySize("SAM", { max: 150, min: 56, width: 608, maxLines: 2 })).toBe(150);
  });

  it("falls back to the minimum for text that cannot fit", () => {
    expect(fitDisplaySize("X".repeat(80), { max: 92, min: 34, width: 608, maxLines: 1 })).toBe(34);
  });
});

describe("logo box", () => {
  it.each([
    [1, 520, 280, { width: 280, height: 280 }],
    [3.2, 520, 280, { width: 520, height: 163 }],
    [10, 200, 76, { width: 200, height: 34 }],
    [null, 200, 76, { width: 76, height: 76 }],
    [0.5, 200, 76, { width: 38, height: 76 }],
  ])("aspect %j in %i×%i", (aspect, maxW, maxH, expected) => {
    expect(logoBox(aspect as number | null, maxW, maxH)).toEqual(expected);
  });
});
