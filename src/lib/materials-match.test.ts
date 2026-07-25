import { describe, expect, it } from "vitest";
import { matchToLibrary, matchToLibraryScored } from "./materials";
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
