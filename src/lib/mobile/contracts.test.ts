import { describe, it, expect } from "vitest";
import { pageOffset, uuid, quoteData } from "./contracts";

const valid = { job_summary: "Deck", currency: "NZD", markup_pct: 10, tax_rate: 15, line_items: [{ type: "material", description: "Boards", unit: "m", quantity: 2.5, unit_price: 30, t2qcal_source_key: "deck.boards" }] };
describe("mobile input boundary", () => {
  it("retains calculator provenance while validating money inputs", () => {
    expect(quoteData(valid).line_items[0].t2qcal_source_key).toBe("deck.boards");
  });
  it.each([NaN, Infinity, -1, "25", null])("rejects unsafe unit price %s", price => {
    expect(() => quoteData({ ...valid, line_items: [{ ...valid.line_items[0], unit_price: price }] })).toThrow();
  });
  it("rejects nested non-record lines and oversized quotes", () => {
    expect(() => quoteData({ ...valid, line_items: [null] })).toThrow();
    expect(() => quoteData({ ...valid, line_items: Array(401).fill(valid.line_items[0]) })).toThrow();
  });
  it("bounds pagination and rejects malformed identifiers", () => {
    expect(pageOffset(null)).toBe(0); expect(pageOffset("100")).toBe(100);
    expect(() => pageOffset("-1")).toThrow(); expect(() => pageOffset("Infinity")).toThrow();
    expect(() => uuid("../another-user")).toThrow();
  });
});
