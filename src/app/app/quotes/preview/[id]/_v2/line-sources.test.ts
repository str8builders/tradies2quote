// Where each line's numbers came from (line-sources.ts): the classic editor's
// badges and confidence rules as the job page's pills and supplier link.
import { describe, expect, it } from "vitest";
import { lineConfidence } from "@/lib/lineConfidence";
import type { QuoteLineItem } from "@/lib/quote-types";
import { lineProvenance, matchedLibrary, webAddress, type LibraryRow } from "./line-sources";
import type { LineLibraryItem } from "./types";

const line = (patch: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Decking 140x32",
  quantity: 42,
  unit: "length",
  unit_price: 36,
  line_total: 1512,
  ...patch,
});

const ITEM: LineLibraryItem = {
  id: "lib-1",
  name: "Kwila decking 140x32",
  default_unit_price: 36,
  supplier: "Bunnings",
  supplier_url: "https://www.bunnings.co.nz/kwila-decking-140x32",
  is_ai_estimated: false,
};

const kinds = (l: QuoteLineItem, item?: LineLibraryItem | null) => lineProvenance(l, item).sources.map((s) => s.kind);

describe("lineProvenance: whose price it is", () => {
  it("a line matched to a priced library item: 'Your library', in the ok tone", () => {
    const out = lineProvenance(line({ library_id: "lib-1" }), ITEM);
    expect(out.sources).toEqual([{ kind: "library", words: "Your library", tone: "ok" }]);
  });

  it("the stored price source counts even when the library item is gone", () => {
    expect(kinds(line({ price_source: "user_library" }))).toEqual(["library"]);
    expect(kinds(line({ price_source: "csv_import" }))).toEqual(["library"]);
  });

  it("a supplier import and the catalogue say so", () => {
    expect(lineProvenance(line({ price_source: "supplier_import" })).sources[0]?.words).toBe("Supplier price");
    expect(lineProvenance(line({ price_source: "catalogue_seed" })).sources[0]?.words).toBe("Catalogue price");
  });

  it("a T2Q estimate (on the line, or saved as one in the library) wins, in the warn tone", () => {
    expect(lineProvenance(line({ is_ai_estimated: true })).sources).toEqual([
      { kind: "estimate", words: "T2Q estimate", tone: "warn" },
    ]);
    expect(kinds(line({ price_source: "ai_estimate" }))).toEqual(["estimate"]);
    expect(kinds(line({ library_id: "lib-1", price_source: "user_library" }), { ...ITEM, is_ai_estimated: true })).toEqual([
      "estimate",
    ]);
  });

  it("follows lib/lineConfidence exactly: trusted → a source, guessed → estimate, no price → nothing", () => {
    const cases: Array<[QuoteLineItem, LineLibraryItem | null]> = [
      [line({ library_id: "lib-1" }), ITEM],
      [line({ price_source: "supplier_import" }), null],
      [line({ is_ai_estimated: true }), null],
      [line({ unit_price: 0, line_total: 0, is_missing_price: true, library_id: "lib-1" }), ITEM],
      [line(), null],
    ];
    for (const [l, item] of cases) {
      const confidence = lineConfidence(l, item);
      const priced = kinds(l, item).filter((k) => k !== "calculated");
      if (confidence === "high") expect(priced).toHaveLength(1);
      if (confidence === "medium") expect(priced).toEqual(["estimate"]);
      if (confidence === "low" || confidence === "none") expect(priced).toEqual([]);
    }
  });

  it("no price, or a price typed on the job: no pill (the row already says 'Needs price', or nothing to say)", () => {
    expect(kinds(line({ unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price" }))).toEqual([]);
    expect(kinds(line({ is_ai_estimated: true, is_missing_price: true, unit_price: 0 }))).toEqual([]);
    expect(lineProvenance(line())).toEqual({ sources: [], link: null });
  });

  it("labour and other lines carry no pills or links, as in the classic editor", () => {
    expect(lineProvenance(line({ type: "labour", price_source: "user_library", library_id: "lib-1" }), ITEM)).toEqual({
      sources: [],
      link: null,
    });
    expect(lineProvenance(line({ type: "other", is_ai_estimated: true }))).toEqual({ sources: [], link: null });
  });
});

describe("lineProvenance: a quantity the calculator worked out", () => {
  it("'Calculated' first, then whose price it is", () => {
    expect(lineProvenance(line({ is_calculated_takeoff: true, takeoff_status: "ok" })).sources).toEqual([
      { kind: "calculated", words: "Calculated", tone: "neutral" },
    ]);
    expect(kinds(line({ is_calculated_takeoff: true, library_id: "lib-1" }), ITEM)).toEqual(["calculated", "library"]);
  });

  it("with guesses it is still calculated (the row's 'Check this' says to look)", () => {
    expect(kinds(line({ is_calculated_takeoff: true, takeoff_status: "assumed" }))).toEqual(["calculated"]);
    expect(kinds(line({ is_calculated_takeoff: true, takeoff_status: "needs_review" }))).toEqual(["calculated"]);
  });

  it("not a line it couldn't work out", () => {
    expect(kinds(line({ is_calculated_takeoff: true, takeoff_status: "blocked", quantity: 0, unit_price: 0 }))).toEqual([]);
  });
});

describe("lineProvenance: the supplier's page", () => {
  it("the matched item's product page, named by its supplier", () => {
    expect(lineProvenance(line({ library_id: "lib-1" }), ITEM).link).toEqual({
      href: "https://www.bunnings.co.nz/kwila-decking-140x32",
      words: "See it at Bunnings",
    });
    expect(lineProvenance(line({ library_id: "lib-1" }), { ...ITEM, supplier: "  " }).link?.words).toBe("See it at the supplier");
  });

  it("kept on a line that still needs a price (the page is where to check it)", () => {
    const out = lineProvenance(line({ library_id: "lib-1", unit_price: 0, line_total: 0, is_missing_price: true }), ITEM);
    expect(out.sources).toEqual([]);
    expect(out.link?.href).toBe(ITEM.supplier_url);
  });

  it("only for the item the line is matched to, and only a web address", () => {
    expect(lineProvenance(line({ library_id: "other" }), ITEM).link).toBeNull();
    expect(lineProvenance(line(), ITEM).link).toBeNull();
    expect(lineProvenance(line({ library_id: "lib-1" }), { ...ITEM, supplier_url: "javascript:alert(1)" }).link).toBeNull();
    expect(lineProvenance(line({ library_id: "lib-1" }), { ...ITEM, supplier_url: null }).link).toBeNull();
  });
});

describe("webAddress", () => {
  it("keeps http and https addresses", () => {
    expect(webAddress(" https://itm.co.nz/p/123 ")).toBe("https://itm.co.nz/p/123");
    expect(webAddress("http://example.test/a b")).toBe("http://example.test/a%20b");
  });

  it("drops anything else", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "bunnings.co.nz/x", "/app/materials", "", "   ", null, undefined]) {
      expect(webAddress(bad)).toBeNull();
    }
  });
});

describe("matchedLibrary (what JobPageV2 sends the phone)", () => {
  const rows: LibraryRow[] = [
    { id: "lib-1", name: "Kwila decking 140x32", default_unit_price: "36.5", supplier: " Bunnings ", supplier_url: "https://b.test/k", is_ai_estimated: null },
    { id: "lib-2", name: "Joist hangers", default_unit_price: null, supplier: null, supplier_url: "javascript:alert(1)", is_ai_estimated: true },
    { id: "lib-3", name: "Not on this job", default_unit_price: 9, supplier: "ITM", supplier_url: "https://itm.test/x", is_ai_estimated: false },
  ];

  it("only the items the lines are matched to, cleaned for the page", () => {
    const out = matchedLibrary(rows, [line({ library_id: "lib-1" }), line({ library_id: "lib-2" }), line({ library_id: null }), line()]);
    expect(out).toEqual([
      {
        id: "lib-1",
        name: "Kwila decking 140x32",
        default_unit_price: 36.5,
        supplier: "Bunnings",
        supplier_url: "https://b.test/k",
        is_ai_estimated: false,
      },
      { id: "lib-2", name: "Joist hangers", default_unit_price: null, supplier: null, supplier_url: null, is_ai_estimated: true },
    ]);
  });

  it("nothing matched, nothing sent", () => {
    expect(matchedLibrary(rows, [line()])).toEqual([]);
    expect(matchedLibrary([], [line({ library_id: "lib-1" })])).toEqual([]);
  });
});
