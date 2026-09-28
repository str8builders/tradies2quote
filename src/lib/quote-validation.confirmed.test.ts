// The "I've checked these" tick at send time is for cautions the tradie
// hasn't answered. Once they've confirmed a line's quantity (the tick on the
// line, or a number they typed), or confirmed the drawing sizes the
// calculator worked its lines out from, that line's "assumed" / "flagged for
// review" caution is answered and must not ask again on every send.
import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "./quote-defaults";
import type { DimensionConfirmation, QuoteData, QuoteLineItem } from "./quote-types";
import {
  assessQuoteTakeoffSafety,
  drawingSizesConfirmed,
  isQuantityChecked,
  validateQuoteForSending,
  validateQuoteForSmsSending,
} from "./quote-validation";
import { applyLineEdit } from "./t2qcalLineEdit";

const line = (o: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Item",
  quantity: 4,
  unit: "each",
  unit_price: 10,
  line_total: 40,
  ...o,
});

/** What generation writes for an AI-estimated material line. */
const aiLine = (o: Partial<QuoteLineItem> = {}) =>
  line({ description: "Decking screws", quantity_source: "ai", quantity_confirmed: false, takeoff_status: "assumed", ...o });

/** A calculator line that used a default (or that the validator flagged). */
const calcLine = (o: Partial<QuoteLineItem> = {}) =>
  line({
    description: "Joists 140x45",
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    takeoff_status: "assumed",
    takeoff_flags: ["Assumed 450 mm joist centres"],
    ...o,
  });

const sizes = (confirmed: boolean): DimensionConfirmation => ({
  required: true,
  reasons: ["low_confidence"],
  takeoff_type: "deck",
  dimensions: [
    { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed },
    { key: "deckWidthM", label: "Deck width", value: 3.6, unit: "m", confirmed },
  ],
  confirmed_by: confirmed ? "user-1" : null,
  confirmed_at: confirmed ? "2026-09-28T01:00:00.000Z" : null,
});

const quote = (line_items: QuoteLineItem[], o: Partial<QuoteData> = {}): QuoteData => ({
  client: { name: "Sam Taylor", address: null, email: "sam@example.com", phone: "+6421234567" },
  job_summary: "Deck",
  line_items,
  markup_pct: 0,
  ...computeQuoteTotals(line_items, 0, 15),
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: [],
  ...o,
});

const send = (q: QuoteData, acknowledged = false) =>
  validateQuoteForSending({ status: "draft", total_amount: q.total, quote_data: q, acknowledged });

describe("the tick is only asked for cautions nobody has answered", () => {
  it("an AI estimate still needs checking: a hard block, not a tick", () => {
    const a = assessQuoteTakeoffSafety(quote([aiLine()]));
    expect(a.can_send).toBe(false);
  });

  it("an AI estimate the tradie confirmed sends without the tick", () => {
    const q = quote([aiLine({ quantity_confirmed: true })]);
    const a = assessQuoteTakeoffSafety(q);
    expect(a).toMatchObject({ can_send: true, requires_acknowledgement: false, warning_reasons: [] });
    expect(send(q)).toEqual({ ok: true, resolvedEmail: "sam@example.com" });
    expect(
      validateQuoteForSmsSending({ status: "draft", total_amount: q.total, quote_data: q, acknowledged: false }),
    ).toEqual({ ok: true, resolvedPhone: "+6421234567" });
  });

  it("a quantity the tradie typed counts as checked (the shared edit rule)", () => {
    const typed = applyLineEdit(aiLine(), { quantity: 6 });
    const q = quote([{ ...typed, line_total: 60 }]);
    expect(assessQuoteTakeoffSafety(q).requires_acknowledgement).toBe(false);
  });

  it("a guessed or flagged calculator line asks until it's checked", () => {
    for (const takeoff_status of ["assumed", "needs_review"] as const) {
      const unchecked = assessQuoteTakeoffSafety(quote([calcLine({ takeoff_status })]));
      expect(unchecked.requires_acknowledgement).toBe(true);
      expect(unchecked.warning_reasons.join(" ")).toContain("Joists 140x45");
      const checked = assessQuoteTakeoffSafety(quote([calcLine({ takeoff_status, quantity_confirmed: true })]));
      expect(checked.requires_acknowledgement).toBe(false);
    }
  });

  it("confirming the drawing's sizes answers the calculator's lines", () => {
    const lines = [calcLine(), calcLine({ description: "Bearers", takeoff_status: "needs_review" })];
    const before = assessQuoteTakeoffSafety(quote(lines, { dimension_confirmation: sizes(false) }));
    expect(before.can_send).toBe(false); // the sizes themselves still hard-block
    const after = quote(lines, { dimension_confirmation: sizes(true) });
    expect(assessQuoteTakeoffSafety(after)).toMatchObject({ can_send: true, requires_acknowledgement: false });
    expect(send(after).ok).toBe(true);
  });

  it("confirmed sizes don't answer an AI line or a line typed in by hand", () => {
    const q = quote([calcLine(), line({ description: "Handrail", takeoff_status: "assumed" })], {
      dimension_confirmation: sizes(true),
    });
    const a = assessQuoteTakeoffSafety(q);
    expect(a.requires_acknowledgement).toBe(true);
    expect(a.warning_reasons.join(" ")).toContain("Handrail");
    expect(a.warning_reasons.join(" ")).not.toContain("Joists");
  });

  it("other cautions still ask: the automated check, $0 lines", () => {
    const checked = [aiLine({ quantity_confirmed: true })];
    const caution = assessQuoteTakeoffSafety(
      quote(checked, { takeoff_evaluation: { status: "caution", reasons: ["decking lm high"], confidence: 0.7 } }),
    );
    expect(caution.warning_reasons).toEqual(["decking lm high"]);
    const unpriced = assessQuoteTakeoffSafety(quote([aiLine({ quantity_confirmed: true, unit_price: 0, line_total: 0 })]));
    expect(unpriced.requires_acknowledgement).toBe(true);
    expect(send(quote([aiLine({ quantity_confirmed: true, unit_price: 0, line_total: 0 })]))).toMatchObject({
      ok: false,
      error: "takeoff_unconfirmed",
    });
  });

  it("a blocked line is never answered by a tick", () => {
    const a = assessQuoteTakeoffSafety(
      quote([calcLine({ takeoff_status: "blocked", quantity: 0, line_total: 0, quantity_confirmed: true })], {
        dimension_confirmation: sizes(true),
      }),
    );
    expect(a.can_send).toBe(false);
  });
});

describe("the rules on their own", () => {
  it("drawing sizes count as confirmed only when every one is", () => {
    expect(drawingSizesConfirmed(sizes(true))).toBe(true);
    expect(drawingSizesConfirmed(sizes(false))).toBe(false);
    expect(
      drawingSizesConfirmed({
        ...sizes(true),
        dimensions: [sizes(true).dimensions[0], { ...sizes(false).dimensions[1] }],
      }),
    ).toBe(false);
    expect(drawingSizesConfirmed({ ...sizes(true), dimensions: [] })).toBe(false);
    expect(drawingSizesConfirmed(null)).toBe(false);
    expect(drawingSizesConfirmed(undefined)).toBe(false);
  });

  it("a line is checked by its own tick, or as a calculator line under confirmed sizes", () => {
    expect(isQuantityChecked({ quantity_confirmed: true })).toBe(true);
    expect(isQuantityChecked({ quantity_source: "calculator" })).toBe(false);
    expect(isQuantityChecked({ quantity_source: "calculator" }, true)).toBe(true);
    expect(isQuantityChecked({ is_calculated_takeoff: true }, true)).toBe(true);
    expect(isQuantityChecked({ quantity_source: "ai", quantity_confirmed: false }, true)).toBe(false);
    expect(isQuantityChecked({}, true)).toBe(false);
  });
});
