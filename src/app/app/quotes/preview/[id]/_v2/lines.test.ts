import { describe, expect, it } from "vitest";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import { computeQuoteTotals } from "@/lib/quote-defaults";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { isUnpricedLine } from "@/lib/quote-validation";
import {
  applyLineForm,
  blankLine,
  blankLineForm,
  checkIndexes,
  confirmLineQuantity,
  groupLines,
  lineForm,
  lineFormProblem,
  lineMarker,
  linePatch,
  newLineFromForm,
  quantityText,
  saveErrorMessage,
  totalsBreakdown,
  unitChangeClearsPrice,
  unpricedIndexes,
  updateLine,
  withLines,
} from "./lines";

const line = (patch: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Joist hanger 190 mm",
  quantity: 28,
  unit: "each",
  unit_price: 3.85,
  line_total: 107.8,
  ...patch,
});

export const quote = (lines: QuoteLineItem[], patch: Partial<QuoteData> = {}): QuoteData => ({
  client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
  job_summary: "New kwila deck at 14 Rata St",
  line_items: lines,
  materials_subtotal: 0,
  labour_subtotal: 0,
  markup_pct: 10,
  markup_amount: 0,
  subtotal_before_tax: 0,
  tax_amount: 0,
  total: 0,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "Terms",
  notes: [],
  ...patch,
});

describe("line edits follow the classic editor's rules", () => {
  it("a typed price prices the line: cents-rounded total, missing-price cleared", () => {
    const next = updateLine(line({ unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price" }), {
      unit_price: 3.855,
    });
    expect(next.unit_price).toBe(3.855);
    expect(next.line_total).toBe(107.94);
    expect(next.is_missing_price).toBe(false);
    expect(next.price_source).toBeUndefined();
  });

  it("typing a quantity makes an AI estimate the tradie's own", () => {
    const next = updateLine(line({ quantity_source: "ai", quantity_confirmed: false }), { quantity: 30 });
    expect(next.quantity_source).toBe("user");
    expect(next.quantity_confirmed).toBe(true);
    expect(next.line_total).toBe(115.5);
  });

  it("re-typing the same AI quantity also confirms it (as the classic editor does)", () => {
    const next = updateLine(line({ quantity_source: "ai", quantity_confirmed: false }), { quantity: 28 });
    expect(next.quantity_source).toBe("user");
    expect(next.quantity_confirmed).toBe(true);
  });

  it("a real quantity recovers a blocked 'needs dimensions' line", () => {
    const blocked = line({
      quantity: 0,
      takeoff_status: "blocked",
      takeoff_flags: ["needs wall length"],
      is_calculated_takeoff: true,
    });
    const next = updateLine(blocked, { quantity: 12 });
    expect(next.takeoff_status).toBeUndefined();
    expect(next.takeoff_flags).toEqual([]);
    expect(next.is_calculated_takeoff).toBe(false);
    expect(next.quantity_confirmed).toBe(true);
  });

  it("changing the unit clears a price that can no longer be right (shared trust rule)", () => {
    const next = updateLine(line(), { unit: "box" });
    expect(next.unit_price).toBe(0);
    expect(next.is_missing_price).toBe(true);
    expect(next.line_total).toBe(0);
  });

  it("confirming an estimate keeps the number", () => {
    expect(confirmLineQuantity(line({ quantity_source: "ai" }))).toMatchObject({ quantity: 28, quantity_confirmed: true });
  });

  it("a blank line matches the classic Add line defaults", () => {
    expect(blankLine("labour")).toMatchObject({ quantity: 1, unit: "hour", unit_price: 0 });
    expect(blankLine("material")).toMatchObject({ quantity: 1, unit: "each", unit_price: 0 });
  });
});

describe("markers: one plain word per line", () => {
  it("unpriced lines say Needs price (any type, the send gate's rule)", () => {
    expect(lineMarker(line({ unit_price: 0, line_total: 0 }))).toBe("price");
    expect(lineMarker(line({ type: "labour", unit_price: 0, line_total: 0 }))).toBe("price");
    expect(lineMarker(line())).toBeNull();
  });

  it("estimated, blocked and flagged lines say Check this, which wins over Needs price", () => {
    expect(lineMarker(line({ quantity_source: "ai", unit_price: 0 }))).toBe("check");
    expect(lineMarker(line({ takeoff_status: "blocked", quantity: 0 }))).toBe("check");
    expect(lineMarker(line({ takeoff_status: "needs_review" }))).toBe("check");
    expect(lineMarker(line({ takeoff_status: "assumed" }))).toBe("check");
    expect(lineMarker(line({ quantity_source: "ai", quantity_confirmed: true }))).toBeNull();
  });

  it("index helpers agree with the gate's unpriced rule", () => {
    const lines = [line(), line({ unit_price: 0 }), line({ type: "labour", unit_price: 0 }), line({ quantity: 0, unit_price: 0 })];
    expect(unpricedIndexes(lines)).toEqual(lines.flatMap((l, i) => (isUnpricedLine(l) ? [i] : [])));
    expect(unpricedIndexes(lines)).toEqual([1, 2]);
    expect(checkIndexes([line(), line({ quantity_source: "ai" })])).toEqual([1]);
  });
});

describe("grouping and wording", () => {
  it("groups Labour, Materials, Other with their original indexes and subtotals", () => {
    const lines = [
      line({ description: "Decking", line_total: 1512 }),
      line({ type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 }),
      line({ type: "other", description: "Skip bin", quantity: 1, unit: "each", unit_price: 350, line_total: 350 }),
      line({ description: "Joists", line_total: 806.4 }),
    ];
    const groups = groupLines(lines);
    expect(groups.map((g) => g.title)).toEqual(["Labour", "Materials", "Other"]);
    expect(groups[1].rows.map((r) => r.index)).toEqual([0, 3]);
    expect(groups[1].subtotal).toBe(2318.4);
    expect(groupLines([line()]).map((g) => g.title)).toEqual(["Materials"]);
  });

  it("says the quantity with its unit", () => {
    expect(quantityText(line())).toBe("28 each");
    expect(quantityText(line({ quantity: 12.5, unit: "m²" }))).toBe("12.5 m²");
    expect(quantityText(line({ unit: "" }))).toBe("28");
  });
});

describe("withLines: what saveQuoteChanges will store", () => {
  it("recomputes every line total and the quote totals with the shared helper", () => {
    const lines = [
      line({ quantity: "3" as unknown as number, unit_price: 3.855, line_total: 999 }),
      line({ type: "labour", quantity: 2, unit_price: 560, line_total: 0 }),
    ];
    const data = withLines(quote([]), lines);
    expect(data.line_items[0]).toMatchObject({ quantity: 3, unit_price: 3.855, line_total: 11.57 });
    expect(data.line_items[1].line_total).toBe(1120);
    const expected = computeQuoteTotals(data.line_items, 10, 15);
    expect(data).toMatchObject(expected);
    expect(data.total).toBe(expected.total);
  });

  it("clamps a slipped markup or tax rate like the server does", () => {
    const data = withLines(quote([], { markup_pct: 900, tax_rate: 155 }), [line()]);
    expect(data.markup_pct).toBe(200);
    expect(data.tax_rate).toBe(50);
  });

  it("falls back to NZD for an empty currency, like the classic editor's save", () => {
    expect(withLines(quote([], { currency: "" }), [line()]).currency).toBe("NZD");
    expect(withLines(quote([], { currency: "AUD" }), [line()]).currency).toBe("AUD");
  });

  it("carries a client change and keeps everything else", () => {
    const base = quote([line()], { terms: "Keep me" });
    const data = withLines(base, base.line_items, { ...base.client, name: "Ana" });
    expect(data.client.name).toBe("Ana");
    expect(data.terms).toBe("Keep me");
  });

  it("breaks the total down the way the classic totals card does", () => {
    const data = withLines(quote([]), [
      line({ line_total: 0 }),
      line({ type: "other", quantity: 1, unit_price: 100 }),
      line({ type: "labour", quantity: 2, unit_price: 50 }),
    ]);
    const b = totalsBreakdown(data);
    expect(b.materials).toBe(107.8);
    expect(b.other).toBe(100);
    expect(b.labour).toBe(100);
    expect(b.materials + b.other + b.markup + b.labour).toBeCloseTo(b.beforeTax, 2);
    expect(b.total).toBe(data.total);
  });
});

describe("the edit sheet form", () => {
  it("opens with the line's values", () => {
    expect(lineForm(line())).toEqual({
      description: "Joist hanger 190 mm",
      quantity: "28",
      unit: "each",
      price: "3.85",
      quantityChecked: true,
    });
    expect(lineForm(line({ unit_price: 0 })).price).toBe("");
    expect(lineForm(line({ quantity_source: "ai" })).quantityChecked).toBe(false);
  });

  it("patches only what changed, so an untouched precise value is never rounded", () => {
    const precise = line({ quantity: 12.3456789, unit_price: 0.0435 });
    const form = { ...lineForm(precise), description: "Joist hanger 190mm galv" };
    expect(linePatch(precise, form)).toEqual({ description: "Joist hanger 190mm galv" });
    expect(applyLineForm(precise, form)).toMatchObject({ quantity: 12.3456789, unit_price: 0.0435 });
  });

  it("an emptied price box saves the line as unpriced", () => {
    const next = applyLineForm(line(), { ...lineForm(line()), price: "" });
    expect(next.unit_price).toBe(0);
    expect(next.is_missing_price).toBe(true);
  });

  it("no change means the same line back", () => {
    expect(applyLineForm(line(), lineForm(line()))).toEqual(line());
  });

  it("ticking 'The quantity is right' confirms an estimate without changing it", () => {
    const ai = line({ quantity_source: "ai", quantity_confirmed: false });
    const next = applyLineForm(ai, { ...lineForm(ai), quantityChecked: true });
    expect(next).toMatchObject({ quantity: 28, quantity_confirmed: true, quantity_source: "ai" });
    expect(applyLineForm(ai, lineForm(ai)).quantity_confirmed).toBe(false);
  });

  it("warns that a new unit clears an untouched price", () => {
    const form = { ...lineForm(line()), unit: "box" };
    expect(unitChangeClearsPrice(line(), form)).toBe(true);
    expect(unitChangeClearsPrice(line(), { ...form, price: "40" })).toBe(false);
    expect(applyLineForm(line(), { ...form, price: "40" })).toMatchObject({ unit: "box", unit_price: 40, line_total: 1120 });
  });

  it("needs a description and a number", () => {
    expect(lineFormProblem({ ...blankLineForm("material"), description: " " })).toBe("description");
    expect(lineFormProblem({ ...blankLineForm("material"), description: "Screws", quantity: "" })).toBe("quantity");
    expect(lineFormProblem({ ...blankLineForm("material"), description: "Screws", price: "." })).toBe("price");
    expect(lineFormProblem({ ...blankLineForm("material"), description: "Screws" })).toBeNull();
  });

  it("a new line goes through the classic add-then-edit path", () => {
    const made = newLineFromForm("labour", { ...blankLineForm("labour"), description: "Labour", quantity: "3", unit: "day", price: "560" });
    expect(made).toMatchObject({
      type: "labour",
      description: "Labour",
      quantity: 3,
      unit: "day",
      unit_price: 560,
      line_total: 1680,
      is_missing_price: false,
      quantity_source: "user",
    });
    const unpriced = newLineFromForm("material", { ...blankLineForm("material"), description: "Screws" });
    expect(unpriced).toMatchObject({ quantity: 1, unit: "each", unit_price: 0 });
    expect(isUnpricedLine(unpriced)).toBe(true);
  });
});

describe("save errors in plain words", () => {
  it("names the lock, hides the rest behind a retry message", () => {
    expect(saveErrorMessage(QUOTE_LOCKED_MESSAGE, QUOTE_LOCKED_MESSAGE)).toMatch(/accepted, so its lines can't change/);
    expect(saveErrorMessage("Could not write line items.", QUOTE_LOCKED_MESSAGE)).toBe(
      "That didn't save. Check your signal and try again.",
    );
  });
});
