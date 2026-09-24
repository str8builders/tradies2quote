import { describe, expect, it } from "vitest";
import type { LibraryMaterial } from "@/lib/quote-types";
import {
  cameFromCapture,
  hasPrice,
  priceRowSubtitle,
  priceSummary,
  searchPriceRows,
  toLibraryMaterial,
  toPriceRow,
  type MaterialRecord,
} from "./prices-model";

const material = (over: Partial<LibraryMaterial> = {}): LibraryMaterial => ({
  id: "m1",
  name: "GIB Standard 10mm 2400x1200",
  unit: "sheet",
  default_unit_price: 24.5,
  supplier: "Mitre 10",
  supplier_url: null,
  notes: null,
  usage_count: 3,
  is_ai_estimated: false,
  last_used_at: null,
  ...over,
});

describe("rows from the database", () => {
  it("maps like the old page: numbers from strings, missing price stays missing", () => {
    const row: MaterialRecord = {
      id: "m9",
      name: "Joist hanger",
      unit: null,
      default_unit_price: "4.20",
      supplier: null,
      supplier_url: null,
      notes: null,
      usage_count: "7",
      is_ai_estimated: null,
      last_used_at: null,
    };
    expect(toLibraryMaterial(row)).toEqual({
      ...row,
      default_unit_price: 4.2,
      usage_count: 7,
      is_ai_estimated: false,
    });
    expect(toLibraryMaterial({ ...row, default_unit_price: null, usage_count: null }).default_unit_price).toBeNull();
  });
});

describe("price rows", () => {
  it("a priced item shows its price and opens the existing edit page", () => {
    expect(toPriceRow(material())).toEqual({
      id: "m1",
      href: "/app/materials/m1/edit",
      name: "GIB Standard 10mm 2400x1200",
      unit: "sheet",
      price: 24.5,
      estimated: false,
      supplier: "Mitre 10",
    });
  });

  it("no price, or a zero price, is 'no price yet'", () => {
    expect(toPriceRow(material({ default_unit_price: null })).price).toBeNull();
    expect(toPriceRow(material({ default_unit_price: 0 })).price).toBeNull();
    expect(hasPrice(0.01)).toBe(true);
    expect(hasPrice(Number.NaN)).toBe(false);
  });

  it("a T2Q estimate is flagged only while there is a price to check", () => {
    expect(toPriceRow(material({ is_ai_estimated: true })).estimated).toBe(true);
    expect(toPriceRow(material({ is_ai_estimated: true, default_unit_price: null })).estimated).toBe(false);
  });

  it("a missing unit reads 'each'", () => {
    expect(toPriceRow(material({ unit: null })).unit).toBe("each");
    expect(toPriceRow(material({ unit: "  " })).unit).toBe("each");
  });

  it("the subtitle is the unit, supplier and any estimate, in plain words", () => {
    expect(priceRowSubtitle(toPriceRow(material()))).toBe("per sheet · Mitre 10");
    expect(priceRowSubtitle(toPriceRow(material({ unit: null, supplier: null })))).toBe("each");
    expect(priceRowSubtitle(toPriceRow(material({ is_ai_estimated: true })))).toBe(
      "per sheet · Mitre 10 · estimated price, check it",
    );
  });
});

describe("search", () => {
  const rows = [
    toPriceRow(material()),
    toPriceRow(material({ id: "m2", name: "Joist hanger 190mm", unit: "each", supplier: "ITM" })),
    toPriceRow(material({ id: "m3", name: "Decking 140x32 H3.2", unit: "m", supplier: "PlaceMakers" })),
  ];

  it("an empty box shows everything, in the saved order", () => {
    expect(searchPriceRows(rows, "").map((r) => r.id)).toEqual(["m1", "m2", "m3"]);
    expect(searchPriceRows(rows, "   ").map((r) => r.id)).toEqual(["m1", "m2", "m3"]);
  });

  it("matches the name or the supplier, any case", () => {
    expect(searchPriceRows(rows, "JOIST").map((r) => r.id)).toEqual(["m2"]);
    expect(searchPriceRows(rows, "placemakers").map((r) => r.id)).toEqual(["m3"]);
  });

  it("every word has to match, in any order", () => {
    expect(searchPriceRows(rows, "10mm gib").map((r) => r.id)).toEqual(["m1"]);
    expect(searchPriceRows(rows, "gib itm")).toEqual([]);
  });
});

describe("summary and the capture banner", () => {
  it("counts the items and those still needing a price", () => {
    expect(priceSummary([toPriceRow(material())])).toBe("1 item saved");
    expect(
      priceSummary([
        toPriceRow(material()),
        toPriceRow(material({ id: "m2", default_unit_price: null })),
        toPriceRow(material({ id: "m3", default_unit_price: 0 })),
      ]),
    ).toBe("3 items saved · 2 with no price yet");
  });

  it("the 'price saved' note shows only straight after the supplier capture page", () => {
    expect(cameFromCapture("https://tradies2quote.com/app/materials/capture")).toBe(true);
    expect(cameFromCapture("https://tradies2quote.com/app/materials")).toBe(false);
    expect(cameFromCapture("not a url")).toBe(false);
    expect(cameFromCapture(null)).toBe(false);
  });
});
