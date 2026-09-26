import { describe, expect, it } from "vitest";
import { assessExtraction, parseSupplierQuoteExtraction } from "./quoteExtraction";
import { validateSupplierQuote } from "./quoteValidation";
import { mergeExtractions, type ScanPage } from "./mergeExtractions";
import { buildScanQuote } from "./scanToQuote";
import { assessQuoteTakeoffSafety } from "../quote-validation";

// Freight, an account discount and other adjustments printed in the TOTALS
// block (not as product rows) are read, so a quote that prints them adds up
// instead of blocking "Create quote".

const PRINTED = {
  supplier: "Kauri Timber Supplies",
  gst_inclusive: false,
  items: [
    { name: "140x45 H3.2 SG8", unit: "m", quantity: 50, price: 12, line_total: 600, sku: null, confidence: 0.95 },
    { name: "Joist hanger 140", unit: "each", quantity: 40, price: 10, line_total: 400, sku: null, confidence: 0.95 },
  ],
  subtotal: 1000,
  discount: "-100.00", // printed "Less account discount -100.00"
  freight: "50.00",
  gst: 142.5,
  total: 1092.5,
  notes: [],
};

describe("parseSupplierQuoteExtraction — totals block", () => {
  it("reads freight and the account discount (as a positive amount off)", () => {
    const r = parseSupplierQuoteExtraction(PRINTED);
    if (!r.ok) throw new Error("parse failed");
    expect(r.value).toMatchObject({ subtotal: 1000, discount: 100, freight: 50, gst: 142.5, total: 1092.5 });
    expect(r.value).not.toHaveProperty("adjustments");
  });

  it("leaves the keys out when the quote prints none (or prints zero)", () => {
    const r = parseSupplierQuoteExtraction({ ...PRINTED, discount: null, freight: 0, adjustments: "" });
    if (!r.ok) throw new Error("parse failed");
    expect(r.value).not.toHaveProperty("discount");
    expect(r.value).not.toHaveProperty("freight");
    expect(r.value).not.toHaveProperty("adjustments");
  });

  it("keeps a negative adjustment's sign (e.g. rounding off the total)", () => {
    const r = parseSupplierQuoteExtraction({ ...PRINTED, adjustments: -0.02 });
    if (!r.ok) throw new Error("parse failed");
    expect(r.value.adjustments).toBe(-0.02);
  });

  it("reconciles once they are read — without them the total can't add up", () => {
    const r = parseSupplierQuoteExtraction(PRINTED);
    if (!r.ok) throw new Error("parse failed");
    expect(validateSupplierQuote(r.value).blocking).toBe(false);
    const { discount: _d, freight: _f, ...without } = r.value;
    const report = validateSupplierQuote(without);
    expect(report.blocking).toBe(true);
    expect(report.reconciliation_reasons.join(" ")).toMatch(/Printed total/);
  });

  it("adds up across pages when the totals are on the last photo", () => {
    const page = (over: Partial<ScanPage>): ScanPage => ({
      supplier: null, currency: null, gst_inclusive: false, items: [], notes: [], ...over,
    });
    const merged = mergeExtractions([
      page({ items: [{ name: "A", unit: "each", price: 10, quantity: 1, source_line_total: 10, sku: null, confidence: 0.9 }] }),
      page({
        items: [{ name: "B", unit: "each", price: 20, quantity: 1, source_line_total: 20, sku: null, confidence: 0.9 }],
        subtotal: 30, freight: 25, discount: 5, total: 57.5,
      }),
    ]);
    expect(merged).toMatchObject({ subtotal: 30, freight: 25, discount: 5, total: 57.5 });
    expect(merged).not.toHaveProperty("adjustments");
  });
});

describe("assessExtraction — price lists", () => {
  it("doesn't expect printed totals on a price list", () => {
    const r = parseSupplierQuoteExtraction({ items: [{ name: "Pine", unit: "m", price: 4.85, confidence: 0.95 }] });
    if (!r.ok) throw new Error("parse failed");
    expect(assessExtraction(r.value, []).reasons).toContain("No printed subtotal or total to reconcile against.");
    expect(assessExtraction(r.value, [], { expectTotals: false })).toEqual({ status: "ok", reasons: [] });
  });
});

describe("buildScanQuote — totals-block adjustments", () => {
  const NZ = { currency: "NZD", taxLabel: "GST", taxRate: 15 };
  const lines = PRINTED.items.map((i) => ({ name: i.name, unit: i.unit, quantity: i.quantity, price: i.price, line_total: i.line_total }));

  it("creates a quote that totals the supplier's, with freight and discount as their own lines", () => {
    const r = buildScanQuote(
      lines,
      { supplier: "Kauri Timber Supplies", gstInclusive: false, subtotal: 1000, gst: 142.5, total: 1092.5, discount: 100, freight: 50 },
      NZ,
    );
    if (!r.ok) throw new Error(r.error);
    const q = r.value;
    expect(q.validation.blocking).toBe(false);
    expect(q.quoteData.total).toBe(1092.5);
    const extra = q.lineItems.slice(2);
    expect(extra.map((l) => [l.description, l.line_total])).toEqual([
      ["Freight", 50],
      ["Account discount", -100],
    ]);
    for (const line of extra) {
      expect(line.source_line_total).toBeUndefined();
      expect(line.source_description).toBeUndefined();
    }
    expect(q.quoteData.supplier_source).toMatchObject({
      subtotal: 1000,
      source_freight: 50,
      source_discount: 100,
      source_adjustments: null,
      reconciliation_status: "ok",
    });
    // The send gate checks the supplier lines against the goods subtotal only.
    const blocks = assessQuoteTakeoffSafety(q.quoteData).block_reasons.filter((b) => /supplier/i.test(b));
    expect(blocks).toEqual([]);
  });

  it("adds nothing when the quote prints no adjustments", () => {
    const r = buildScanQuote(lines, { supplier: null, gstInclusive: false, subtotal: 1000, gst: 150, total: 1150 }, NZ);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.lineItems).toHaveLength(2);
    expect(r.value.quoteData.total).toBe(1150);
  });
});
