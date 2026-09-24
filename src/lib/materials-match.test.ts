import { describe, expect, it } from "vitest";
import {
  libraryPriceForLine,
  matchToLibrary,
  matchToLibraryScored,
  verifiedLibraryUnitPrice,
} from "./materials";
import type { LibraryMaterial } from "./quote-types";

const lib = (id: string, name: string, price: number | null): LibraryMaterial =>
  ({
    id,
    name,
    unit: "each",
    default_unit_price: price,
    supplier: null,
    supplier_url: null,
    notes: null,
    usage_count: 0,
    is_ai_estimated: false,
    last_used_at: null,
  }) as unknown as LibraryMaterial;

const LIBRARY = [
  lib("a", "H3.2 Fence Paling 150x19 1.8m", 4.85),
  lib("b", "Screws", 12),
  lib("c", "H4 Post 125x125 2.4m", 38.9),
];

describe("matchToLibraryScored", () => {
  it("reports specificity for a multi-token match (price-trust gate ≥2)", () => {
    const m = matchToLibraryScored(
      "H3.2 fence paling 150x19 1.8m treated pine",
      LIBRARY,
    );
    expect(m?.item.id).toBe("a");
    expect(m && m.specificity >= 2).toBe(true);
  });

  it("single generic-token match has specificity 1 (too weak to auto-price)", () => {
    const m = matchToLibraryScored("stainless screws for decking", LIBRARY);
    expect(m?.item.id).toBe("b");
    expect(m?.specificity).toBe(1);
  });

  it("no match returns null", () => {
    expect(matchToLibraryScored("bag of concrete", LIBRARY)).toBeNull();
  });

  it("matchToLibrary keeps its original contract (item only)", () => {
    expect(matchToLibrary("h4 post 125x125 2.4m", LIBRARY)?.id).toBe("c");
    expect(matchToLibrary("", LIBRARY)).toBeNull();
  });
});

// ─── Audit 2026-09-24, item 4 — tokenisation, dimensions, ties, units ────
const row = (
  id: string,
  name: string,
  price: number | null,
  unit: string | null,
  extra: Partial<LibraryMaterial> = {},
): LibraryMaterial => ({
  id,
  name,
  unit,
  default_unit_price: price,
  supplier: null,
  supplier_url: null,
  notes: null,
  usage_count: 0,
  is_ai_estimated: false,
  last_used_at: null,
  ...extra,
});

describe("library matching keeps decimals and dimensions", () => {
  const posts = [row("p24", "Post 100x100 H5 2.4m", 40, "each")];

  it('"Post 100x100 H5 5.4m" does NOT match the 2.4m row (the "." split bug)', () => {
    expect(matchToLibraryScored("Post 100x100 H5 5.4m", posts)).toBeNull();
    expect(libraryPriceForLine({ description: "Post 100x100 H5 5.4m", unit: "each" }, posts)).toBeNull();
  });

  it("matches the exact length, including spaced / mm spellings", () => {
    const lib = [...posts, row("p54", "Post 100x100 H5 5.4m", 78, "each")];
    expect(matchToLibraryScored("Post 100x100 H5 5.4m", lib)?.item.id).toBe("p54");
    expect(matchToLibraryScored("Post 100 x 100 H5 5.4 m", lib)?.item.id).toBe("p54");
    expect(matchToLibraryScored("Post 100x100 H5 5400mm", lib)?.item.id).toBe("p54");
    expect(matchToLibraryScored("H3.2 90x45 framing", [row("h32", "H3.2 90x45", 5, "m"), row("h12", "H1.2 90x45", 4, "m")])?.item.id).toBe("h32");
  });

  it("a dimension-less row links but never auto-prices a dimensioned line", () => {
    const lib = [row("generic", "Post 100x100 H5", 40, "each")];
    const m = matchToLibraryScored("Post 100x100 H5 5.4m", lib);
    expect(m?.item.id).toBe("generic");
    expect(m?.exactDimensions).toBe(false);
    const priced = libraryPriceForLine({ description: "Post 100x100 H5 5.4m", unit: "each" }, lib);
    expect(priced?.match.item.id).toBe("generic");
    expect(priced?.unitPrice).toBeNull();
  });
});

describe("library matching tie-breaks", () => {
  it("is deterministic whatever the library order (not 'first tie wins')", () => {
    const a = row("a", "Decking screws 10g 50mm", 30, "box", { usage_count: 9 });
    const b = row("b", "50mm decking screws 10g", 30, "box", { usage_count: 2 });
    expect(matchToLibraryScored("Decking screws 10g 50mm", [a, b])?.item.id).toBe("a");
    expect(matchToLibraryScored("Decking screws 10g 50mm", [b, a])?.item.id).toBe("a");
    // Same price + unit → not ambiguous.
    expect(matchToLibraryScored("Decking screws 10g 50mm", [b, a])?.ambiguous).toBe(false);
  });

  it("equally good rows with DIFFERENT prices are ambiguous → no auto price", () => {
    const lib = [
      row("x", "GIB Standard 10mm", 30, "sheet"),
      row("y", "10mm GIB Standard", 34.5, "sheet"),
    ];
    const hit = libraryPriceForLine({ description: "GIB Standard 10mm", unit: "sheet" }, lib);
    expect(hit?.match.ambiguous).toBe(true);
    expect(hit?.unitPrice).toBeNull();
  });

  it("prefers the unit-compatible row when the line's unit is known", () => {
    const lib = [
      row("sheet", "GIB Standard 10mm", 30, "sheet", { usage_count: 50 }),
      row("area", "GIB Standard 10mm", 10.4, "m2"),
    ];
    const hit = libraryPriceForLine({ description: "GIB Standard 10mm", unit: "m²" }, lib);
    expect(hit?.match.item.id).toBe("area");
    expect(hit?.unitPrice).toBe(10.4);
  });
});

describe("library prices require compatible units", () => {
  it("$30/sheet is never applied to 40 m²", () => {
    const lib = [row("gib", "GIB Standard 10mm", 30, "sheet")];
    const hit = libraryPriceForLine({ description: "GIB Standard 10mm plasterboard", unit: "m²" }, lib);
    expect(hit?.match.item.id).toBe("gib"); // still linked
    expect(hit?.unitPrice).toBeNull(); // but not priced
  });

  it("a per-pack batt price is never applied to 45 m²", () => {
    const lib = [row("batts", "Pink Batts R2.6 wall", 95, "pack")];
    const hit = libraryPriceForLine({ description: "Pink Batts R2.6 wall insulation", unit: "m2" }, lib);
    expect(hit?.unitPrice).toBeNull();
  });

  it("applies the price when units match or convert exactly", () => {
    const lib = [row("joist", "H3.2 Joist 140x45", 11.2, "m")];
    expect(libraryPriceForLine({ description: "H3.2 joist 140x45", unit: "lm" }, lib)?.unitPrice).toBe(11.2);
    const perMm = [row("trim", "Aluminium angle 40x40", 0.05, "mm")];
    expect(libraryPriceForLine({ description: "Aluminium angle 40x40", unit: "m" }, perMm)?.unitPrice).toBe(50);
  });

  it("verifiedLibraryUnitPrice re-derives the price from the linked row", () => {
    const lib = [row("joist", "H3.2 Joist 140x45", 11.2, "m")];
    expect(verifiedLibraryUnitPrice({ library_id: "joist", unit: "m" }, lib)).toBe(11.2);
    expect(verifiedLibraryUnitPrice({ library_id: "joist", unit: "each" }, lib)).toBeNull();
    expect(verifiedLibraryUnitPrice({ library_id: "nope", unit: "m" }, lib)).toBeNull();
    expect(verifiedLibraryUnitPrice({ library_id: null, unit: "m" }, lib)).toBeNull();
  });
});
