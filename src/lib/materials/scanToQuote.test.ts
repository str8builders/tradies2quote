import { describe, expect, it } from "vitest";
import { buildScanQuote, scanLinesToItems, type ScanQuoteLine } from "./scanToQuote";
import { assessQuoteTakeoffSafety } from "../quote-validation";

// The server path of "Create quote" from a supplier scan, checked against the
// SAME pre-send gate the quote meets later (supplier source fidelity is a
// hard block with no override).
const NZ = { currency: "NZD", taxLabel: "GST", taxRate: 15 };

function build(lines: ScanQuoteLine[], meta: { gstInclusive: boolean; subtotal?: number; gst?: number; total?: number }) {
  const r = buildScanQuote(lines, { supplier: "ITM", ...meta }, NZ);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
const supplierBlocks = (reasons: string[]) => reasons.filter((r) => /supplier/i.test(r));

describe("buildScanQuote — GST-inclusive supplier quotes", () => {
  it("10 × $10 incl: creates without a mismatch and the send gate does not hard-block", () => {
    const q = build([{ name: "Bracket", unit: "each", quantity: 10, price: 10, line_total: 100 }], {
      gstInclusive: true, subtotal: 100, gst: 13.04, total: 100,
    });
    expect(q.validation.blocking).toBe(false);
    expect(q.lineItems[0]).toMatchObject({ line_total: 86.96, source_line_total: 86.96 });
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
    expect(q.quoteData.total).toBe(100);
  });

  it("10,000 × $0.05 incl: the quote totals $500.00, not $460", () => {
    const q = build([{ name: "Staples", unit: "each", quantity: 10_000, price: 0.05, line_total: 500 }], {
      gstInclusive: true, subtotal: 500, gst: 65.22, total: 500,
    });
    expect(q.validation.blocking).toBe(false);
    expect(q.quoteData.total).toBe(500);
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
  });

  it("100 × $9.99 incl: the quote totals $999.00 (±1c), not $999.35", () => {
    const q = build([{ name: "Hinge", unit: "each", quantity: 100, price: 9.99, line_total: 999 }], {
      gstInclusive: true, subtotal: 999, gst: 130.3, total: 999,
    });
    expect(Math.abs(q.quoteData.total - 999)).toBeLessThanOrEqual(0.01);
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
  });

  it("six $10 incl lines: per-line cent rounding is not mistaken for a missing line", () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({ name: `Item ${i + 1}`, unit: "each", quantity: 1, price: 10, line_total: 10 }));
    const q = build(lines, { gstInclusive: true, subtotal: 60, gst: 7.83, total: 60 });
    expect(q.validation.blocking).toBe(false);
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
  });

  it("a line printed without a line total doesn't read as a missing line", () => {
    const q = build(
      [
        { name: "A", unit: "each", quantity: 3, price: 10, line_total: 30 },
        { name: "B", unit: "each", quantity: 1, price: 7.77, line_total: null },
      ],
      { gstInclusive: true, subtotal: 37.77, total: 37.77 },
    );
    expect(q.validation.blocking).toBe(false);
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
  });

  it("still hard-blocks at send when a sourced line is later removed", () => {
    const q = build(
      [
        { name: "A", unit: "each", quantity: 1, price: 60, line_total: 60 },
        { name: "B", unit: "each", quantity: 1, price: 40, line_total: 40 },
      ],
      { gstInclusive: true, subtotal: 100, total: 100 },
    );
    const edited = { ...q.quoteData, line_items: q.quoteData.line_items.slice(0, 1) };
    expect(assessQuoteTakeoffSafety(edited).block_reasons.join(" ")).toMatch(/missing or duplicated|supplier subtotal/i);
  });
});

describe("buildScanQuote — server validation compares like with like", () => {
  it("does not round the reviewed unit price: 1000 × $0.125 reconciles with the printed $125", () => {
    const q = build([{ name: "Nails", unit: "each", quantity: 1000, price: 0.125, line_total: 125 }], {
      gstInclusive: false, subtotal: 125, gst: 18.75, total: 143.75,
    });
    expect(q.validation.blocking).toBe(false);
    expect(q.quoteData.total).toBe(143.75);
  });

  it("keeps a printed discount line (negative) so the quote matches the supplier total", () => {
    const q = build(
      [
        { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
        { name: "Trade discount", unit: "each", quantity: 1, price: -25, line_total: -25 },
      ],
      { gstInclusive: false, subtotal: 475, gst: 71.25, total: 546.25 },
    );
    expect(q.validation.blocking).toBe(false);
    expect(q.lineItems[1]).toMatchObject({ unit_price: -25, line_total: -25 });
    expect(q.quoteData.total).toBe(546.25);
    expect(supplierBlocks(assessQuoteTakeoffSafety(q.quoteData).block_reasons)).toEqual([]);
  });

  it("maps reviewed lines without rounding and keeps negative / zero printed totals", () => {
    expect(scanLinesToItems([{ name: " Nails ", unit: "", quantity: 1000, price: 0.125, line_total: 125 }])[0]).toMatchObject({
      name: "Nails", unit: "each", price: 0.125, quantity: 1000, source_line_total: 125,
    });
    expect(scanLinesToItems([{ name: "Credit", unit: "each", quantity: 1, price: -5, line_total: -5 }])[0]).toMatchObject({
      price: -5, source_line_total: -5,
    });
    expect(scanLinesToItems([{ name: "Freebie", unit: "each", quantity: 1, price: 0, line_total: 0 }])[0]).toMatchObject({
      price: null, source_line_total: 0,
    });
  });
});
