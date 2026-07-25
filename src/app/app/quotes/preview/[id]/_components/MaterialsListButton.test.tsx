import { describe, expect, it } from "vitest";
import { buildMaterialsListText } from "./MaterialsListButton";
import type { QuoteLineItem } from "@/lib/quote-types";

const li = (
  type: QuoteLineItem["type"],
  description: string,
  quantity: number,
  unit: string,
): QuoteLineItem =>
  ({
    type,
    description,
    quantity,
    unit,
    unit_price: 0,
    line_total: 0,
  }) as QuoteLineItem;

describe("buildMaterialsListText", () => {
  it("lists materials with quantities and units, no prices anywhere", () => {
    const text = buildMaterialsListText(
      [
        li("material", "Deck joists (4.8m stock)", 13, "lengths"),
        li("material", "Decking boards (90mm)", 225.72, "m"),
        li("labour", "Deck laying", 15, "hour"),
      ],
      "6x4m rear deck",
    );
    expect(text).toContain("Materials list");
    expect(text).toContain("6x4m rear deck");
    expect(text).toContain("• 13 lengths — Deck joists (4.8m stock)");
    expect(text).toContain("• 225.72 m — Decking boards (90mm)");
    // Labour never belongs on a merchant list.
    expect(text).not.toContain("Deck laying");
    // No price/currency noise — this is a quantities-only list.
    expect(text).not.toMatch(/\$/);
  });

  it("includes 'other' lines (they are buyable, unlike labour)", () => {
    const text = buildMaterialsListText([
      li("other", "Skip bin hire", 1, "each"),
    ]);
    expect(text).toContain("• 1 each — Skip bin hire");
  });

  it("trims float noise but keeps real decimals", () => {
    const text = buildMaterialsListText([
      li("material", "Sand", 2.5, "m3"),
      li("material", "Posts", 4, "each"),
    ]);
    expect(text).toContain("• 2.5 m3 — Sand");
    expect(text).toContain("• 4 each — Posts");
  });
});
