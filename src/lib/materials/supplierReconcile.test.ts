import { describe, expect, it } from "vitest";
import { computeQuoteTotals, round2 } from "../quote-defaults";
import type { QuoteData, QuoteLineItem } from "../quote-types";
import { assessQuoteTakeoffSafety } from "../quote-validation";
import { applyLineEdit } from "../t2qcalLineEdit";
import { preciseUnitPrice } from "./quoteExtraction";
import { validateSupplierQuote } from "./quoteValidation";
import { buildScanQuote, type ScanQuoteLine, type ScanQuoteMeta } from "./scanToQuote";
import {
  hasSupplierSource,
  reconciliationMismatches,
  supplierCheck,
  supplierMismatches,
  supplierQuantityBack,
  supplierReconciliation,
  supplierSnapPrice,
  withLineBack,
  withSupplierPrice,
  withSupplierPriceAt,
  withSupplierValues,
} from "./supplierReconcile";

// Supplier reconciliation, moved out of the classic editor and lined up with
// the send gate. Two contracts: the classic panel computes exactly what it
// did inline, and the new-look checks agree with the gate's HARD block in
// both directions (fixed ⇒ the gate lets it through, flagged ⇒ it blocks).

const NZ = { currency: "NZD", taxLabel: "GST", taxRate: 15 };

function scan(lines: ScanQuoteLine[], meta: Partial<ScanQuoteMeta> & { gstInclusive: boolean }): QuoteData {
  const built = buildScanQuote(lines, { supplier: "ITM Tauranga", ...meta }, NZ);
  if (!built.ok) throw new Error(built.error);
  return built.value.quoteData;
}

/** An exclusive ITM quote that reconciles: 1,210.20 + 181.53 GST = 1,391.73. */
const itm = () =>
  scan(
    [
      { name: "Pine 90x45 H1.2 4.8m", unit: "length", quantity: 12, price: 14.35, line_total: 172.2 },
      { name: "GIB Standard 2400x1200 10mm", unit: "sheet", quantity: 20, price: 28.9, line_total: 578 },
      { name: "Nails 75mm 1kg", unit: "box", quantity: 2, price: 12.5, line_total: 25 },
      { name: "Staples 10mm", unit: "each", quantity: 10_000, price: 0.0435, line_total: 435 },
    ],
    { gstInclusive: false, subtotal: 1210.2, gst: 181.53, total: 1391.73 },
  );

/** A GST-inclusive quote: the ex-GST lines come from the printed inclusive totals. */
const inclusive = () =>
  scan(
    [
      { name: "Bracket", unit: "each", quantity: 10, price: 10, line_total: 100 },
      { name: "Hinge", unit: "each", quantity: 100, price: 9.99, line_total: 999 },
      { name: "Screws", unit: "box", quantity: 3, price: 7.77, line_total: 23.31 },
    ],
    { gstInclusive: true, subtotal: 1122.31, gst: 146.39, total: 1122.31 },
  );

/** A row printed without a line total, and freight from the totals block. */
const withFreight = () =>
  scan(
    [
      { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
      { name: "Deck screws", unit: "box", quantity: 1, price: 45.5, line_total: null },
    ],
    { gstInclusive: false, subtotal: 545.5, freight: 60, gst: 90.83, total: 696.33 },
  );

/** The quote as saveQuoteChanges stores it: cents line totals, totals recomputed. */
function relined(data: QuoteData, lines: readonly QuoteLineItem[]): QuoteData {
  const items = lines.map((it) => {
    const quantity = Number(it.quantity) || 0;
    const unit_price = Number(it.unit_price) || 0;
    return { ...it, quantity, unit_price, line_total: round2(quantity * unit_price) };
  });
  return { ...data, line_items: items, ...computeQuoteTotals(items, data.markup_pct, data.tax_rate) };
}

/** QuoteEditor.updateItem, verbatim but for the React state. */
function updateItem(items: readonly QuoteLineItem[], idx: number, patch: Partial<QuoteLineItem>): QuoteLineItem[] {
  return items.map((it, i) => {
    if (i !== idx) return it;
    const next = applyLineEdit(it, patch);
    next.line_total = round2((Number(next.quantity) || 0) * (Number(next.unit_price) || 0));
    if (patch.quantity !== undefined && next.quantity_source === "ai") {
      next.quantity_source = "user";
      next.quantity_confirmed = true;
    }
    if (patch.quantity !== undefined && next.takeoff_status === "blocked" && (Number(next.quantity) || 0) > 0) {
      next.takeoff_status = undefined;
      next.takeoff_flags = [];
      next.is_calculated_takeoff = false;
      next.quantity_source = "user";
      next.quantity_confirmed = true;
    }
    return next;
  });
}

const edit = (data: QuoteData, index: number, patch: Partial<QuoteLineItem>) =>
  relined(data, updateItem(data.line_items, index, patch));

/**
 * QuoteEditor.tsx's supplier code as it stood inline before the move (the
 * reconciliation memo, applySupplierLineValue and the panel's mismatch
 * filter), verbatim but for the React state.
 */
function classicEditor(initialData: QuoteData, items: QuoteLineItem[]) {
  const taxRate = initialData.tax_rate;
  const currency = initialData.currency || "NZD";
  const supplierSource = initialData.supplier_source ?? null;
  const hasSupplierSource =
    !!supplierSource &&
    (supplierSource.subtotal != null ||
      supplierSource.gst != null ||
      supplierSource.total != null ||
      items.some((it) => it.source_line_total != null));
  const reconciliation = (() => {
    if (!hasSupplierSource) return null;
    return validateSupplierQuote(
      {
        supplier: supplierSource?.supplier ?? null,
        quote_number: null,
        currency,
        gst_inclusive: false,
        items: items.map((it) => ({
          name: it.description,
          unit: it.unit,
          price: Number(it.unit_price) || null,
          sku: null,
          quantity: Number(it.quantity) || null,
          pieces: null,
          source_line_total: it.source_line_total ?? null,
          raw_text: null,
          confidence: 1,
        })),
        subtotal: supplierSource?.subtotal ?? null,
        gst: supplierSource?.gst ?? null,
        total: supplierSource?.total ?? null,
        notes: [],
      },
      { taxRate: taxRate / 100 },
    );
  })();
  function applySupplierLineValue(idx: number): QuoteLineItem[] {
    const it = items[idx];
    if (!it || it.source_line_total == null) return items;
    const qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return items;
    return updateItem(items, idx, { unit_price: preciseUnitPrice(it.source_line_total / qty) });
  }
  const mismatches = reconciliation
    ? items
        .map((it, idx) => ({ it, idx, check: reconciliation.lines[idx]?.checks[0] }))
        .filter((x) => x.check && x.check.found != null && x.check.severity === "error")
    : [];
  return { reconciliation, mismatches, applySupplierLineValue };
}

/** The same, through the lib (the replacement QuoteEditor.tsx gets). */
function movedEditor(initialData: QuoteData, items: QuoteLineItem[]) {
  const currency = initialData.currency || "NZD";
  const reconciliation = supplierReconciliation(initialData.supplier_source ?? null, items, {
    currency,
    taxRate: initialData.tax_rate,
  });
  function applySupplierLineValue(idx: number): QuoteLineItem[] {
    const it = items[idx];
    const price = it ? supplierSnapPrice(it) : null;
    if (price === null) return items;
    return updateItem(items, idx, { unit_price: price });
  }
  const mismatches = reconciliation ? reconciliationMismatches(reconciliation, items) : [];
  return { reconciliation, mismatches, applySupplierLineValue };
}

/** The send gate's two supplier reasons (quote-validation.ts, PHASE 4). */
const LINE_REASON = /^(\d+) line\(s\) no longer match the supplier quote: /;
const SUBTOTAL_REASON = /^The supplier subtotal doesn't match the imported lines/;
function gate(data: QuoteData) {
  const reasons = assessQuoteTakeoffSafety(data).block_reasons;
  const line = reasons.find((r) => LINE_REASON.test(r));
  return {
    reasons: reasons.filter((r) => LINE_REASON.test(r) || SUBTOTAL_REASON.test(r)),
    lines: line ? Number(LINE_REASON.exec(line)![1]) : 0,
    subtotal: reasons.some((r) => SUBTOTAL_REASON.test(r)),
  };
}

/** The lib and the gate see the same thing, and the sheet's "fixed" is the gate's pass. */
function expectAgreement(data: QuoteData) {
  const m = supplierMismatches(data);
  const g = gate(data);
  expect(m.lines.length, "lines off").toBe(g.lines);
  expect(m.subtotal !== null, "subtotal off").toBe(g.subtotal);
  expect(m.count === 0, "nothing off").toBe(g.reasons.length === 0);
  const check = supplierCheck(data);
  if (check) expect(check.fixed, "sheet says fixed").toBe(g.reasons.length === 0);
}

const labour: QuoteLineItem = {
  type: "labour",
  description: "Install the lining",
  quantity: 16,
  unit: "hour",
  unit_price: 75,
  line_total: 1200,
};

/* ── The classic editor's panel, moved ─────────────────────────────────── */

describe("classic editor reconciliation, moved into the lib", () => {
  const cases: Array<[string, QuoteData]> = (() => {
    const base = itm();
    const withNoPrice = edit(base, 1, { unit_price: 0 });
    return [
      ["as scanned (exclusive)", base],
      ["as scanned (GST inclusive)", inclusive()],
      ["no printed total on a row, freight from the totals", withFreight()],
      ["a price changed", edit(base, 0, { unit_price: 15.5 })],
      ["a quantity changed", edit(base, 1, { quantity: 18 })],
      ["a price taken to 0", withNoPrice],
      ["a quantity taken to 0", edit(base, 2, { quantity: 0 })],
      ["a line deleted", relined(base, base.line_items.slice(1))],
      ["a labour line added", relined(base, [...base.line_items, labour])],
      ["a trade discount line", scan(
        [
          { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
          { name: "Trade discount", unit: "each", quantity: 1, price: -25, line_total: -25 },
        ],
        { gstInclusive: false, subtotal: 475, gst: 71.25, total: 546.25 },
      )],
      ["the discount line changed", edit(scan(
        [
          { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
          { name: "Trade discount", unit: "each", quantity: 1, price: -25, line_total: -25 },
        ],
        { gstInclusive: false, subtotal: 475, gst: 71.25, total: 546.25 },
      ), 1, { unit_price: -20 })],
      ["only printed totals, no line totals", { ...base, line_items: base.line_items.map((l) => ({ ...l, source_line_total: null })) }],
      ["an empty currency and a 0% tax rate", { ...edit(base, 0, { unit_price: 15.5 }), currency: "", tax_rate: 0 }],
    ];
  })();

  it.each(cases)("%s: the same report, flagged lines and snap as inline", (_name, data) => {
    const items = data.line_items;
    const before = classicEditor(data, items);
    const after = movedEditor(data, items);
    expect(after.reconciliation).toEqual(before.reconciliation);
    expect(after.mismatches).toEqual(before.mismatches);
    for (let idx = -1; idx <= items.length; idx++) {
      expect(after.applySupplierLineValue(idx)).toEqual(before.applySupplierLineValue(idx));
    }
  });

  it.each(cases)("%s: withSupplierPrice is the classic snap of one line", (_name, data) => {
    const items = data.line_items;
    const before = classicEditor(data, items);
    items.forEach((line, idx) => {
      expect(withSupplierPrice(line)).toEqual(before.applySupplierLineValue(idx)[idx]);
    });
  });

  it("no panel for a voice or typed quote, or a supplier source with nothing printed", () => {
    const base = itm();
    const voice: QuoteData = { ...base, supplier_source: undefined, line_items: [labour] };
    expect(supplierReconciliation(voice.supplier_source, voice.line_items, { currency: "NZD", taxRate: 15 })).toBeNull();
    expect(classicEditor(voice, voice.line_items).reconciliation).toBeNull();
    const blank: QuoteData = {
      ...base,
      supplier_source: { supplier: "ITM", subtotal: null, gst: null, total: null },
      line_items: [labour],
    };
    expect(hasSupplierSource(blank.supplier_source, blank.line_items)).toBe(false);
    expect(supplierReconciliation(blank.supplier_source, blank.line_items, { currency: "NZD", taxRate: 15 })).toBeNull();
  });

  it("flags a changed price and snaps it back at full precision", () => {
    const data = edit(itm(), 3, { unit_price: 0.05 });
    const report = supplierReconciliation(data.supplier_source, data.line_items, { currency: "NZD", taxRate: 15 })!;
    expect(report.reconciliation_status).toBe("blocked");
    const [flagged] = reconciliationMismatches(report, data.line_items);
    expect(flagged).toMatchObject({ idx: 3, check: { found: 435, expected: 500, severity: "error" } });
    const snapped = withSupplierPrice(data.line_items[3]);
    expect(snapped.unit_price).toBe(0.0435);
    expect(snapped.line_total).toBe(435);
  });
});

/* ── The snap value ────────────────────────────────────────────────────── */

describe("supplierSnapPrice", () => {
  it("keeps the unit price at full precision: 10,000 staples at $435 is $0.0435 each, not $0.04", () => {
    expect(supplierSnapPrice({ quantity: 10_000, source_line_total: 435 })).toBe(0.0435);
    expect(supplierSnapPrice({ quantity: 3, source_line_total: 100 })).toBe(33.33333333);
    expect(supplierSnapPrice({ quantity: 1, source_line_total: -25 })).toBe(-25);
  });

  it("nothing to do without a printed line total or a quantity above 0", () => {
    expect(supplierSnapPrice({ quantity: 5, source_line_total: null })).toBeNull();
    expect(supplierSnapPrice({ quantity: 5 })).toBeNull();
    expect(supplierSnapPrice({ quantity: 0, source_line_total: 50 })).toBeNull();
    expect(supplierSnapPrice({ quantity: -2, source_line_total: 50 })).toBeNull();
    expect(supplierSnapPrice({ quantity: Number.NaN, source_line_total: 50 })).toBeNull();
  });

  it("always lands the line total on the supplier's to the cent", () => {
    let seed = 20260927;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const quantities = [1, 2, 3, 7, 12, 0.3, 2.4, 13.5, 48.6, 999, 10_000, 0.001];
    for (let i = 0; i < 4000; i++) {
      const quantity = quantities[i % quantities.length] * (1 + Math.floor(next() * 5));
      const total = round2((Math.floor(next() * 2_000_000) - 100_000) / 100);
      const price = supplierSnapPrice({ quantity, source_line_total: total });
      if (price === null) continue;
      expect(round2(quantity * price), `${quantity} × ${price}`).toBe(total);
    }
  });
});

/* ── Agreement with the send gate ──────────────────────────────────────── */

describe("new-look checks agree with the send gate", () => {
  it("a quote as scanned matches, and the gate lets it through", () => {
    for (const data of [itm(), inclusive(), withFreight()]) {
      expect(supplierMismatches(data)).toMatchObject({ supplier: "ITM Tauranga", lines: [], subtotal: null, count: 0 });
      expect(gate(data).reasons).toEqual([]);
      expect(supplierCheck(data)!.fixed).toBe(true);
    }
  });

  it("a changed price is flagged and blocked; the supplier's value fixes both", () => {
    const data = edit(itm(), 0, { unit_price: 15.5 });
    const m = supplierMismatches(data);
    expect(m.count).toBe(1);
    expect(m.lines[0]).toMatchObject({ index: 0, supplierTotal: 172.2, liveTotal: 186, mismatch: true, snapPrice: 14.35 });
    expect(gate(data).reasons[0]).toContain("Pine 90x45 H1.2 4.8m");
    expectAgreement(data);

    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(fixed.line_items[0]).toMatchObject({ unit_price: 14.35, line_total: 172.2 });
    expect(supplierCheck(fixed)!.fixed).toBe(true);
    expect(gate(fixed).reasons).toEqual([]);
  });

  it("several lines off: one at a time, or all at once", () => {
    let data = edit(itm(), 0, { unit_price: 15.5 });
    data = edit(data, 3, { unit_price: 0.05 });
    data = edit(data, 1, { quantity: 18 });
    expect(supplierMismatches(data).lines.map((l) => l.index)).toEqual([0, 1, 3]);
    expectAgreement(data);

    const one = relined(data, withSupplierValues(data.line_items, [3]));
    expect(supplierMismatches(one).lines.map((l) => l.index)).toEqual([0, 1]);
    expect(one.line_items[3]).toMatchObject({ unit_price: 0.0435, line_total: 435 });
    expect(one.line_items[0]).toEqual(data.line_items[0]);
    expectAgreement(one);

    const all = relined(data, withSupplierValues(data.line_items));
    expect(gate(all).reasons).toEqual([]);
    expect(supplierCheck(all)!.fixed).toBe(true);
    // Their quantity goes back, at their price (not 18 at a made-up $32.11).
    expect(all.line_items[1]).toMatchObject({ quantity: 20, unit_price: 28.9, line_total: 578 });
    // Or the tradie keeps 18 and the price makes the supplier's total (the classic snap).
    const kept = relined(data, withSupplierPriceAt(data.line_items, 1));
    expect(kept.line_items[1]).toMatchObject({ quantity: 18, unit_price: 32.11111111, line_total: 578 });
    expect(supplierMismatches(kept).lines.map((l) => l.index)).toEqual([0, 3]);
    expectAgreement(kept);
  });

  it("a GST-inclusive line snaps back to its ex-GST supplier total", () => {
    const base = inclusive();
    const data = edit(base, 1, { unit_price: 9 });
    expectAgreement(data);
    expect(supplierMismatches(data).lines).toHaveLength(1);
    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(fixed.line_items[1].line_total).toBe(base.line_items[1].source_line_total);
    expect(gate(fixed).reasons).toEqual([]);
  });

  it("a price taken to 0: the classic panel only warns, the gate blocks — the sheet follows the gate and fixes it", () => {
    const data = edit(itm(), 1, { unit_price: 0 });
    const classic = classicEditor(data, data.line_items);
    expect(classic.mismatches.map((m) => m.idx)).not.toContain(1);
    expect(supplierMismatches(data).lines[0]).toMatchObject({ index: 1, liveTotal: 0, snapPrice: 28.9 });
    expectAgreement(data);
    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(fixed.line_items[1]).toMatchObject({ unit_price: 28.9, line_total: 578, is_missing_price: false });
    expect(gate(fixed).reasons).toEqual([]);
  });

  it("a quantity taken to 0 can't be snapped, but their quantity goes back", () => {
    const data = edit(itm(), 2, { quantity: 0 });
    const check = supplierCheck(data)!;
    expect(check.mismatched.map((r) => r.index)).toEqual([2]);
    expect(check.fixable.map((r) => r.index)).toEqual([2]);
    expect(check.fixed).toBe(false);
    expectAgreement(data);
    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(fixed.line_items[2]).toMatchObject({ quantity: 2, unit_price: 12.5, line_total: 25 });
    expect(gate(fixed).reasons).toEqual([]);
  });

  it("a quantity taken to 0 with no known quantity of theirs: still flagged, still blocked, left alone", () => {
    const data = edit(itm(), 2, { quantity: 0, source_quantity: null });
    const check = supplierCheck(data)!;
    expect(check.fixable).toEqual([]);
    expect(withSupplierValues(data.line_items)).toEqual(data.line_items);
    expect(withSupplierPriceAt(data.line_items, 2)).toEqual(data.line_items);
    expectAgreement(data);
  });

  it("the 2c edge: the classic panel rounds the difference first, the gate doesn't — the sheet follows the gate", () => {
    const base = scan(
      [
        { name: "Washers", unit: "each", quantity: 1, price: 0.07, line_total: 0.07 },
        { name: "Bolts", unit: "each", quantity: 10, price: 1, line_total: 10 },
      ],
      { gstInclusive: false, subtotal: 10.07, gst: 1.51, total: 11.58 },
    );
    const data = edit(base, 0, { unit_price: 0.05 });
    expect(classicEditor(data, data.line_items).mismatches).toEqual([]);
    expect(gate(data).lines).toBe(1);
    expect(supplierMismatches(data).lines.map((l) => l.index)).toEqual([0]);
    expectAgreement(data);
    // 10.02 against 10.00 is inside the tolerance for both.
    expectAgreement(edit(base, 1, { unit_price: 1.002 }));
    expect(supplierMismatches(edit(base, 1, { unit_price: 1.002 })).count).toBe(0);
  });

  it("lines the tradie adds are left alone by both (the classic panel's subtotal counts them)", () => {
    const base = itm();
    const data = relined(base, [...base.line_items, labour]);
    expect(supplierMismatches(data).count).toBe(0);
    expect(gate(data).reasons).toEqual([]);
    const check = supplierCheck(data)!;
    expect(check.others).toEqual([{ index: 4, line: data.line_items[4] }]);
    expect(check.fixed).toBe(true);
    const classic = classicEditor(data, data.line_items).reconciliation!;
    expect(classic.summary.find((c) => c.field === "subtotal")?.severity).toBe("error");
  });

  it("freight from the supplier's totals isn't one of their lines: not checked, not counted", () => {
    const data = withFreight();
    const check = supplierCheck(data)!;
    expect(check.rows.map((r) => r.line.description)).toEqual(["Decking 140x32", "Deck screws"]);
    expect(check.rows[1]).toMatchObject({ supplierTotal: null, mismatch: false });
    expect(check.others.map((o) => o.line.description)).toEqual(["Freight"]);
    expect(check.subtotal).toMatchObject({ supplier: 545.5, lines: 545.5, difference: 0, mismatch: false });
    expect(data.total).toBe(696.33);
  });
});

describe("the subtotal: lines taken off or on twice", () => {
  it("a deleted line: short by its total, blocked; named from the scanned-in lines and put back where it was", () => {
    const base = itm();
    const data = relined(base, [base.line_items[0], base.line_items[2], base.line_items[3]]);
    expect(supplierMismatches(data).subtotal).toMatchObject({ supplier: 1210.2, lines: 632.2, difference: -578, mismatch: true });
    expectAgreement(data);

    const check = supplierCheck(data, base.line_items)!;
    expect(check.fixed).toBe(false);
    expect(check.gap).toMatchObject({ repeated: [], unexplained: false });
    expect(check.gap!.removed).toEqual([{ line: base.line_items[1], from: 1, insertAt: 1 }]);

    const back = relined(data, withLineBack(data.line_items, check.gap!.removed[0]));
    expect(back.line_items.map((l) => l.description)).toEqual(base.line_items.map((l) => l.description));
    expect(gate(back).reasons).toEqual([]);
    expect(supplierCheck(back, base.line_items)!.fixed).toBe(true);
  });

  it("the first or last line deleted goes back first or last; the tradie's own lines stay put", () => {
    const base = itm();
    const first = relined(base, [...base.line_items.slice(1), labour]);
    const [removedFirst] = supplierCheck(first, base.line_items)!.gap!.removed;
    expect(removedFirst.insertAt).toBe(0);
    expect(withLineBack(first.line_items, removedFirst).map((l) => l.description)).toEqual([
      ...base.line_items.map((l) => l.description),
      labour.description,
    ]);

    const last = relined(base, [...base.line_items.slice(0, 3), labour]);
    const [removedLast] = supplierCheck(last, base.line_items)!.gap!.removed;
    expect(removedLast).toMatchObject({ from: 3, insertAt: 3 });
    expect(gate(relined(last, withLineBack(last.line_items, removedLast))).reasons).toEqual([]);
  });

  it("a line re-added by hand doesn't count as theirs: still blocked, still named", () => {
    const base = itm();
    const gone = base.line_items[1];
    const byHand: QuoteLineItem = { type: "material", description: gone.description, quantity: gone.quantity, unit: gone.unit, unit_price: gone.unit_price, line_total: gone.line_total };
    const data = relined(base, [base.line_items[0], byHand, base.line_items[2], base.line_items[3]]);
    expect(gate(data).subtotal).toBe(true);
    expectAgreement(data);
    const check = supplierCheck(data, base.line_items)!;
    expect(check.gap!.removed.map((r) => r.from)).toEqual([1]);
    expect(check.others.map((o) => o.index)).toEqual([1]);
  });

  it("without the scanned-in lines a deleted line can't be named: the gap is left unexplained", () => {
    const base = itm();
    const data = relined(base, base.line_items.slice(1));
    const gap = supplierCheck(data)!.gap!;
    expect(gap).toMatchObject({ removed: [], repeated: [], unexplained: true, ownPrice: [], unread: [] });
  });

  it("a line on twice: over by its total, blocked; named with and without the scanned-in lines", () => {
    const base = itm();
    const data = relined(base, [...base.line_items, { ...base.line_items[2] }]);
    expect(supplierMismatches(data).subtotal).toMatchObject({ difference: 25, mismatch: true });
    expectAgreement(data);
    for (const imported of [null, base.line_items]) {
      const gap = supplierCheck(data, imported)!.gap!;
      expect(gap.repeated).toEqual([{ line: data.line_items[2], indexes: [2, 4], extra: 1 }]);
      expect(gap).toMatchObject({ removed: [], unexplained: false });
    }
    const fixed = relined(data, data.line_items.slice(0, 4));
    expect(gate(fixed).reasons).toEqual([]);
    expect(supplierCheck(fixed)!.fixed).toBe(true);
  });

  it("a repeat that's on the supplier's quote too isn't blamed for a line taken off", () => {
    const base = scan(
      [
        { name: "Joist hanger", unit: "each", quantity: 10, price: 2.5, line_total: 25 },
        { name: "Joist hanger", unit: "each", quantity: 10, price: 2.5, line_total: 25 },
        { name: "Bearer 140x45", unit: "length", quantity: 4, price: 30, line_total: 120 },
      ],
      { gstInclusive: false, subtotal: 170, gst: 25.5, total: 195.5 },
    );
    expect(supplierMismatches(base).count).toBe(0);
    const data = relined(base, base.line_items.slice(0, 2));
    expect(supplierCheck(data)!.gap).toMatchObject({ repeated: [], removed: [], unexplained: true });
    expect(supplierCheck(data, base.line_items)!.gap).toMatchObject({ repeated: [], unexplained: false });
  });

  it("a row printed without a total counts at your price: changing it puts the subtotal out", () => {
    const base = withFreight();
    const data = edit(base, 1, { unit_price: 55 });
    expect(supplierMismatches(data)).toMatchObject({ lines: [], subtotal: { difference: 9.5 }, count: 1 });
    expectAgreement(data);
    const gap = supplierCheck(data)!.gap!;
    expect(gap.unexplained).toBe(true);
    expect(gap.ownPrice.map((r) => r.line.description)).toEqual(["Deck screws"]);
  });

  it("rows the scan couldn't read are named when the gap is there from the start", () => {
    const data = scan(
      [
        { name: "Post 100x100", unit: "length", quantity: 4, price: 25, line_total: 100 },
        { name: "Concrete bag", unit: "bag", quantity: 6, price: 9.5, line_total: 57 },
      ],
      {
        gstInclusive: false,
        subtotal: 199,
        gst: 29.85,
        total: 228.85,
        rowFailures: [{ index: 2, reason: "price unreadable", raw_text: "Post cap galv 4 @ $10.50" }, { index: 3, reason: "no name", raw_text: null }],
      },
    );
    expectAgreement(data);
    expect(supplierCheck(data)!.gap).toMatchObject({ unexplained: true, unread: ["Post cap galv 4 @ $10.50"] });
  });

  it("the gate doesn't add them up without a printed subtotal or any printed line total", () => {
    const base = itm();
    const noSubtotal = { ...base, supplier_source: { ...base.supplier_source!, subtotal: null } };
    const cut = relined(noSubtotal, noSubtotal.line_items.slice(1));
    expect(supplierMismatches(cut).count).toBe(0);
    expect(supplierCheck(cut)!.subtotal).toBeNull();
    expectAgreement(cut);

    const noLineTotals = relined(base, base.line_items.slice(1).map((l) => ({ ...l, source_line_total: null })));
    expect(supplierMismatches(noLineTotals).count).toBe(0);
    expectAgreement(noLineTotals);
  });

  it("not a supplier quote: nothing to check", () => {
    const voice: QuoteData = { ...itm(), supplier_source: undefined, line_items: [labour] };
    expect(supplierCheck(voice)).toBeNull();
    expect(supplierMismatches(voice)).toEqual({ supplier: null, lines: [], subtotal: null, count: 0 });
    expect(gate(voice).reasons).toEqual([]);
  });
});

describe("agreement holds under any mix of edits", () => {
  it("random prices, quantities, deletions, repeats and added lines", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const bases = [itm(), inclusive(), withFreight()];
    const seen = { linesOff: 0, subtotalOff: 0, matching: 0, putBack: 0 };
    for (let run = 0; run < 600; run++) {
      const base = pick(bases);
      let lines = [...base.line_items];
      const steps = 1 + Math.floor(rand() * 3);
      for (let s = 0; s < steps && lines.length > 0; s++) {
        const i = Math.floor(rand() * lines.length);
        const line = lines[i];
        switch (pick(["nudge", "price", "quantity", "zero", "delete", "repeat", "labour"] as const)) {
          case "nudge": {
            // Move the line total by -3c…+3c: the tolerance edge, float noise and all.
            const cents = Math.floor(rand() * 7) - 3;
            const qty = Number(line.quantity) || 1;
            lines = updateItem(lines, i, { unit_price: (line.line_total + cents / 100) / qty });
            break;
          }
          case "price":
            lines = updateItem(lines, i, { unit_price: round2(rand() * 60) });
            break;
          case "quantity":
            lines = updateItem(lines, i, { quantity: 1 + Math.floor(rand() * 30) });
            break;
          case "zero":
            lines = updateItem(lines, i, rand() < 0.5 ? { unit_price: 0 } : { quantity: 0 });
            break;
          case "delete":
            lines = lines.filter((_, j) => j !== i);
            break;
          case "repeat":
            lines = [...lines, { ...line }];
            break;
          case "labour":
            lines = [...lines, labour];
            break;
        }
      }
      const data = relined(base, lines);
      expectAgreement(data);
      const off = supplierMismatches(data);
      if (off.lines.length > 0) seen.linesOff++;
      if (off.subtotal) seen.subtotalOff++;
      if (off.count === 0) seen.matching++;

      // The sheet's fix for every line it can fix clears the gate's line check
      // whenever every flagged line could be fixed.
      const check = supplierCheck(data, base.line_items)!;
      const fixed = relined(data, withSupplierValues(data.line_items));
      expectAgreement(fixed);
      if (check.fixable.length === check.mismatched.length) expect(gate(fixed).lines).toBe(0);
      // Putting back every line taken off closes a gap they alone explain.
      const gap = check.gap;
      let back = fixed.line_items;
      for (let n = 0; n < 5; n++) {
        const removed = supplierCheck(relined(base, back), base.line_items)?.gap?.removed[0];
        if (!removed) break;
        back = withLineBack(back, removed);
        seen.putBack++;
      }
      const restored = relined(base, back);
      expectAgreement(restored);
      if (gap && !gap.unexplained && gap.repeated.length === 0) expect(gate(restored).subtotal).toBe(false);
    }
    // Every kind of outcome came up.
    expect(Math.min(seen.linesOff, seen.subtotalOff, seen.matching, seen.putBack)).toBeGreaterThan(30);
  });
});

/* ── A quantity changed since the scan ─────────────────────────────────── */

describe("a quantity changed since the scan", () => {
  it("puts their quantity back at their price, not a nonsense rate, and the gate lets it through", () => {
    const data = edit(itm(), 0, { quantity: 99 });
    expect(supplierQuantityBack(data.line_items[0])).toBe(12);
    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(fixed.line_items[0]).toMatchObject({ quantity: 12, unit_price: 14.35, line_total: 172.2 });
    expect(gate(fixed).reasons).toEqual([]);
    expectAgreement(fixed);
  });

  it("the price moved, not the quantity: the classic snap, as before", () => {
    const data = edit(itm(), 0, { unit_price: 15.5 });
    expect(supplierQuantityBack(data.line_items[0])).toBeNull();
    expect(relined(data, withSupplierValues(data.line_items)).line_items[0]).toMatchObject({ quantity: 12, unit_price: 14.35 });
  });

  it("in another unit than theirs, or theirs unknown: no put-back (the quantities don't compare)", () => {
    const line = itm().line_items[0];
    expect(supplierQuantityBack({ ...line, quantity: 99, unit: "m" })).toBeNull();
    expect(supplierQuantityBack({ ...line, quantity: 99, source_quantity: null })).toBeNull();
  });

  it("a line with no quantity left can still be fixed by putting theirs back", () => {
    const data = edit(itm(), 0, { quantity: 0 });
    const check = supplierCheck(data)!;
    expect(check.fixable.map((r) => r.index)).toContain(0);
    expect(relined(data, withSupplierValues(data.line_items)).line_items[0]).toMatchObject({ quantity: 12, line_total: 172.2 });
  });
});
