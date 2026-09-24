import { describe, expect, it } from "vitest";
import {
  assessQuoteContradictions,
  assessQuoteTakeoffSafety,
  isUnpricedLine,
  normalizePhone,
  validateQuoteForSending,
  validateQuoteForSmsSending,
} from "./quote-validation";
import { guardQuoteForReview, licensedFamiliesForDescription } from "./reviewGuard";
import { computeQuoteTotals } from "./quote-defaults";
import type {
  DimensionConfirmation,
  QuoteData,
  QuoteLineItem,
} from "./quote-types";

describe("normalizePhone", () => {
  it("returns empty string for empty input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("   ")).toBe("");
  });

  it("strips whitespace, dashes, parens, dots", () => {
    expect(normalizePhone("+64 22 504 4457")).toBe("+64225044457");
    expect(normalizePhone("(022) 504-4457")).toBe("+64225044457");
    expect(normalizePhone("022.504.4457")).toBe("+64225044457");
  });

  it("converts NZ national format to E.164", () => {
    expect(normalizePhone("0225044457")).toBe("+64225044457");
    expect(normalizePhone("027 555 1234")).toBe("+64275551234");
  });

  it("passes through correctly formatted E.164", () => {
    expect(normalizePhone("+6422504457")).toBe("+6422504457");
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
    expect(normalizePhone("+15125551234")).toBe("+15125551234");
  });

  it("fixes the country-code-plus-leading-zero data-entry bug", () => {
    // The common NZ tradie data-entry mistake: typing +64 AND keeping
    // the leading 0. Twilio rejects this — the leading 0 is a national
    // prefix, not part of the subscriber number. Live bug caught in
    // production on 2026-05-17.
    expect(normalizePhone("+640225044457")).toBe("+64225044457");
    expect(normalizePhone("+64 022 504 4457")).toBe("+64225044457");
    expect(normalizePhone("+64-022-504-4457")).toBe("+64225044457");
  });

  it("leaves non-NZ international numbers untouched", () => {
    // +44 (UK) → 0 after the country code is NOT a leading-zero bug,
    // it's just an unlikely combination. We only special-case +64.
    expect(normalizePhone("+447700900123")).toBe("+447700900123");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Wave 45 — takeoff safety gate.
// ─────────────────────────────────────────────────────────────────────────

const li = (o: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Item",
  quantity: 1,
  unit: "each",
  unit_price: 10,
  line_total: 10,
  ...o,
});

// Totals are DERIVED from the line items so every fixture is arithmetically
// consistent — the send gate now hard-blocks totals that don't tie out, and
// these tests are about other concerns. Explicit overrides in `o` still win
// (for tests that deliberately tamper a figure).
const qd = (o: Partial<QuoteData> = {}): QuoteData => {
  const line_items = o.line_items ?? [li()];
  const markup_pct = o.markup_pct ?? 0;
  const tax_rate = o.tax_rate ?? 15;
  const totals = computeQuoteTotals(line_items, markup_pct, tax_rate);
  return {
    client: {
      name: "Jane Tradie",
      address: null,
      email: "jane@example.com",
      phone: "+6421234567",
    },
    job_summary: "job",
    line_items,
    markup_pct,
    ...totals,
    currency: "NZD",
    tax_label: "GST",
    tax_rate,
    terms: "",
    notes: [],
    ...o,
  };
};

describe("assessQuoteTakeoffSafety", () => {
  it("allows a clean quote (all ok lines, no evaluator)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ takeoff_status: "ok" })] }),
    );
    expect(a.can_send).toBe(true);
    expect(a.requires_acknowledgement).toBe(false);
  });

  it("allows a legacy quote with no takeoff signals at all", () => {
    const a = assessQuoteTakeoffSafety(qd({ line_items: [li()] }));
    expect(a.can_send).toBe(true);
    expect(a.requires_acknowledgement).toBe(false);
  });

  it("hard-blocks when any line is blocked", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ takeoff_status: "ok" }),
          li({ takeoff_status: "blocked", description: "Roof sheets" }),
        ],
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.block_reasons.length).toBeGreaterThan(0);
  });

  it("hard-blocks when the evaluator verdict is fail", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok" })],
        takeoff_evaluation: {
          status: "fail",
          reasons: ["roof area looks wrong"],
          confidence: 0.2,
        },
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.block_reasons).toContain("roof area looks wrong");
  });

  it("requires acknowledgement for needs_review lines", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ takeoff_status: "needs_review" })] }),
    );
    expect(a.can_send).toBe(true);
    expect(a.requires_acknowledgement).toBe(true);
  });

  it("requires acknowledgement for assumed lines", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ takeoff_status: "assumed" })] }),
    );
    expect(a.requires_acknowledgement).toBe(true);
  });

  it("requires acknowledgement for an evaluator caution", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok" })],
        takeoff_evaluation: {
          status: "caution",
          reasons: ["decking lm high"],
          confidence: 0.7,
        },
      }),
    );
    expect(a.requires_acknowledgement).toBe(true);
    expect(a.warning_reasons).toContain("decking lm high");
  });

  it("hard block supersedes a warning (blocked + needs_review)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ takeoff_status: "needs_review" }),
          li({ takeoff_status: "blocked" }),
        ],
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.requires_acknowledgement).toBe(false);
  });
});

describe("assessQuoteTakeoffSafety — supplier source fidelity (phase 4)", () => {
  it("allows a clean supplier import (lines + subtotal tie out)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity: 10, unit_price: 20, line_total: 200, source_line_total: 200 }),
        ],
        supplier_source: { supplier: "ITM", subtotal: 200, gst: 30, total: 230 },
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("HARD-blocks when a sourced line no longer matches the supplier value", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        // price edited 20 → 25, line is now 250 but source is 200
        line_items: [
          li({ quantity: 10, unit_price: 25, line_total: 250, source_line_total: 200 }),
        ],
        supplier_source: { supplier: "ITM", subtotal: 200, gst: 30, total: 230 },
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.requires_acknowledgement).toBe(false); // no override
    expect(a.block_reasons.join(" ")).toMatch(/supplier quote/i);
  });

  it("HARD-blocks when the supplier subtotal doesn't match the imported lines", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity: 10, unit_price: 20, line_total: 200, source_line_total: 200 }),
        ],
        // subtotal claims 350 but only 200 of sourced lines present
        supplier_source: { supplier: "ITM", subtotal: 350, gst: 52.5, total: 402.5 },
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.block_reasons.join(" ")).toMatch(/missing|duplicated|supplier subtotal/i);
  });

  it("does NOT false-block a tradie-added line (no source_line_total)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity: 10, unit_price: 20, line_total: 200, source_line_total: 200 }),
          li({ type: "labour", description: "Install", quantity: 1, unit_price: 400, line_total: 400 }),
        ],
        supplier_source: { supplier: "ITM", subtotal: 200, gst: 30, total: 230 },
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("ignores supplier checks entirely for non-supplier quotes", () => {
    const a = assessQuoteTakeoffSafety(qd({ line_items: [li()] }));
    expect(a.can_send).toBe(true);
  });

  it("does NOT false-block when a supplier line had no printed line total", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity: 10, unit_price: 20, line_total: 200, source_line_total: 200, source_description: "Pine", source_unit_price: 20 }),
          // printed with a unit price but no line total
          li({ description: "GIB", quantity: 2, unit_price: 50, line_total: 100, source_line_total: null, source_description: "GIB", source_unit_price: 50 }),
        ],
        supplier_source: { supplier: "ITM", subtotal: 300, gst: 45, total: 345 },
      }),
    );
    expect(a.block_reasons.filter((r) => /supplier/i.test(r))).toEqual([]);
  });

  it("still HARD-blocks when a fully-sourced supplier line is deleted", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity: 10, unit_price: 20, line_total: 200, source_line_total: 200, source_description: "Pine", source_unit_price: 20 }),
        ],
        supplier_source: { supplier: "ITM", subtotal: 300, gst: 45, total: 345 },
      }),
    );
    expect(a.block_reasons.join(" ")).toMatch(/missing|duplicated|supplier subtotal/i);
  });
});

describe("assessQuoteTakeoffSafety — AI-supplied quantity (phase 7)", () => {
  it("HARD-blocks an unconfirmed AI-supplied material quantity", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ quantity_source: "ai", quantity_confirmed: false }),
        ],
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.requires_acknowledgement).toBe(false); // no override
    expect(a.block_reasons.join(" ")).toMatch(/AI-estimated quantity/i);
  });

  it("allows an AI quantity once confirmed", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ quantity_source: "ai", quantity_confirmed: true })],
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("allows calculator / supplier / user quantities without confirmation", () => {
    for (const src of ["calculator", "supplier", "user"] as const) {
      const a = assessQuoteTakeoffSafety(
        qd({ line_items: [li({ quantity_source: src })] }),
      );
      expect(a.can_send).toBe(true);
    }
  });

  it("ignores AI quantity_source on non-material lines (labour)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({
            type: "labour",
            quantity_source: "ai",
            quantity_confirmed: false,
          }),
        ],
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("treats legacy lines (no quantity_source) as not AI", () => {
    const a = assessQuoteTakeoffSafety(qd({ line_items: [li()] }));
    expect(a.can_send).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// #1 — Drawing key-dimension confirmation (HARD BLOCK, no override).
//
// A risky drawing's key dimensions must all be confirmed before the quote
// can be sent. Like the supplier-fidelity and AI-quantity blocks, this can
// NOT be overridden by an acknowledgement. Absent / not-required / fully
// confirmed → no block (no friction).
// ─────────────────────────────────────────────────────────────────────────
describe("assessQuoteTakeoffSafety — drawing dimension confirmation (#1)", () => {
  const dc = (o: Partial<DimensionConfirmation> = {}): DimensionConfirmation => ({
    required: true,
    reasons: ["low_confidence"],
    takeoff_type: "deck",
    dimensions: [
      { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed: false },
      { key: "deckWidthM", label: "Deck width", value: 3, unit: "m", confirmed: false },
    ],
    confirmed_by: null,
    confirmed_at: null,
    ...o,
  });

  it("HARD-blocks a risky drawing whose key dimensions aren't all confirmed", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })], dimension_confirmation: dc() }),
    );
    expect(a.can_send).toBe(false);
    expect(a.requires_acknowledgement).toBe(false); // no override
    expect(a.block_reasons.join(" ")).toMatch(/dimension/i);
  });

  it("blocks when only SOME of the key dimensions are confirmed", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })],
        dimension_confirmation: dc({
          dimensions: [
            { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed: true },
            { key: "deckWidthM", label: "Deck width", value: 3, unit: "m", confirmed: false },
          ],
        }),
      }),
    );
    expect(a.can_send).toBe(false);
  });

  it("allows the quote once every key dimension is confirmed", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })],
        dimension_confirmation: dc({
          confirmed_by: "user-123",
          confirmed_at: "2026-05-22T00:00:00.000Z",
          dimensions: [
            { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed: true },
            { key: "deckWidthM", label: "Deck width", value: 3, unit: "m", confirmed: true },
          ],
        }),
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("does not block when confirmation is not required", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })],
        dimension_confirmation: dc({ required: false }),
      }),
    );
    expect(a.can_send).toBe(true);
  });

  it("does not block legacy / voice quotes (no dimension_confirmation)", () => {
    const a = assessQuoteTakeoffSafety(qd({ line_items: [li({ takeoff_status: "ok" })] }));
    expect(a.can_send).toBe(true);
  });

  it("surfaces the reason for confirmation + the dimension labels in the block", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })],
        dimension_confirmation: dc({ reasons: ["no_scale"] }),
      }),
    );
    const joined = a.block_reasons.join(" ");
    expect(joined).toMatch(/Deck length|Deck width/);
  });

  it("acknowledgement can NOT override the dimension-confirmation block", () => {
    const r = validateQuoteForSending({
      status: "draft",
      total_amount: 11.5,
      quote_data: qd({
        line_items: [li({ takeoff_status: "ok", quantity_source: "calculator" })],
        dimension_confirmation: dc(),
      }),
      acknowledged: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_blocked");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Beta safety — unpriced material guard. A material line with no price (or
// $0) silently undercharges the quote. It must require an acknowledgement
// before sending (a flag, not a hard block — a $0 line can be intentional).
// ─────────────────────────────────────────────────────────────────────────
describe("assessQuoteTakeoffSafety — unpriced material guard", () => {
  it("WARNS (requires ack, not a hard block) on an is_missing_price material line", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ is_missing_price: true, unit_price: 0, line_total: 0 })] }),
    );
    expect(a.can_send).toBe(true);
    expect(a.requires_acknowledgement).toBe(true);
    expect(a.warning_reasons.join(" ")).toMatch(/price/i);
  });

  it("WARNS on a material line with a $0 price and a real quantity", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ unit_price: 0, quantity: 3, line_total: 0 })] }),
    );
    expect(a.requires_acknowledgement).toBe(true);
  });

  it("does NOT warn when every material line is priced", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ unit_price: 12, quantity: 2, line_total: 24 })] }),
    );
    expect(a.requires_acknowledgement).toBe(false);
  });

  // Audit 2026-09-24 (item 2): the guard covers EVERY line type. A $0
  // labour/other line is still sendable (it can be a deliberate allowance)
  // but only after the same acknowledgement as a $0 material.
  it("flags a $0 other line too — acknowledgeable, never a hard block", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ unit_price: 50, line_total: 50 }),
          li({ type: "other", description: "Disposal — included", unit_price: 0, quantity: 1, line_total: 0 }),
        ],
      }),
    );
    expect(a.can_send).toBe(true);
    expect(a.requires_acknowledgement).toBe(true);
    expect(a.warning_reasons.join(" ")).toMatch(/1 line\(s\) have no price set.*Disposal/);
  });

  it("flags a labour line whose price was wiped (10 h at $0)", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ unit_price: 50, line_total: 50 }),
          li({ type: "labour", description: "Labour", unit: "hour", quantity: 10, unit_price: 0, line_total: 0 }),
        ],
      }),
    );
    expect(a.requires_acknowledgement).toBe(true);
    expect(a.warning_reasons.join(" ")).toMatch(/Labour/);
  });

  it("a price-pending labour line (is_missing_price) is flagged", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ type: "labour", description: "Labour — 2 days", unit: "day", quantity: 2, unit_price: 0, line_total: 0, is_missing_price: true }),
        ],
      }),
    );
    expect(a.requires_acknowledgement).toBe(true);
  });

  it("does NOT double-flag a blocked takeoff line (qty 0) as unpriced", () => {
    const a = assessQuoteTakeoffSafety(
      qd({ line_items: [li({ takeoff_status: "blocked", quantity: 0, unit_price: 0, line_total: 0 })] }),
    );
    expect(a.can_send).toBe(false); // hard-blocked by takeoff
    expect(a.requires_acknowledgement).toBe(false); // block supersedes any warning
  });

  it("a hard block supersedes the unpriced warning", () => {
    const a = assessQuoteTakeoffSafety(
      qd({
        line_items: [
          li({ is_missing_price: true, unit_price: 0, line_total: 0, quantity: 2 }),
          li({ takeoff_status: "blocked", quantity: 0, unit_price: 0, line_total: 0 }),
        ],
      }),
    );
    expect(a.can_send).toBe(false);
    expect(a.requires_acknowledgement).toBe(false);
  });
});

describe("validateQuoteForSending — unpriced material", () => {
  const data = qd({
    line_items: [
      li({ unit_price: 50, line_total: 50 }),
      li({ is_missing_price: true, unit_price: 0, line_total: 0, description: "GIB sheets" }),
    ],
  });

  it("requires acknowledgement to send a quote with an unpriced material line", () => {
    const r = validateQuoteForSending({ status: "draft", total_amount: 50, quote_data: data });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_unconfirmed");
  });

  it("sends once acknowledged", () => {
    const r = validateQuoteForSending({ status: "draft", total_amount: 50, quote_data: data, acknowledged: true });
    expect(r.ok).toBe(true);
  });
});

describe("validateQuoteForSending — takeoff gate", () => {
  const args = (o: Partial<QuoteData>, acknowledged?: boolean) => ({
    status: "draft",
    total_amount: 11.5,
    quote_data: qd(o),
    acknowledged,
  });

  it("blocks sending a quote with a blocked line", () => {
    const r = validateQuoteForSending(
      args({ line_items: [li({ takeoff_status: "blocked" })] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("takeoff_blocked");
      expect(r.reasons?.length).toBeGreaterThan(0);
    }
  });

  it("requires acknowledgement for a needs_review line", () => {
    const r = validateQuoteForSending(
      args({ line_items: [li({ takeoff_status: "needs_review" })] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_unconfirmed");
  });

  it("sends a needs_review quote once acknowledged", () => {
    const r = validateQuoteForSending(
      args({ line_items: [li({ takeoff_status: "needs_review" })] }, true),
    );
    expect(r.ok).toBe(true);
  });

  it("acknowledgement can NOT override a hard block", () => {
    const r = validateQuoteForSending(
      args({ line_items: [li({ takeoff_status: "blocked" })] }, true),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_blocked");
  });

  it("REGRESSION: ok-calculated lines are still blocked when the evaluator failed", () => {
    const r = validateQuoteForSending(
      args({
        line_items: [li({ takeoff_status: "ok" })],
        takeoff_evaluation: {
          status: "fail",
          reasons: ["implausible"],
          confidence: 0.1,
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_blocked");
  });

  it("still enforces the pre-existing checks before the takeoff gate", () => {
    const r = validateQuoteForSending(
      args({
        client: { name: "Jane", address: null, email: null, phone: null },
        line_items: [li({ takeoff_status: "blocked" })],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("client_email_missing");
  });

  it("passes a clean quote", () => {
    const r = validateQuoteForSending(
      args({ line_items: [li({ takeoff_status: "ok" })] }),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateQuoteForSmsSending — takeoff gate", () => {
  const args = (o: Partial<QuoteData>, acknowledged?: boolean) => ({
    status: "draft",
    total_amount: 11.5,
    quote_data: qd(o),
    acknowledged,
  });

  it("blocks a blocked line over SMS too", () => {
    const r = validateQuoteForSmsSending(
      args({ line_items: [li({ takeoff_status: "blocked" })] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_blocked");
  });

  it("sends an assumed quote once acknowledged", () => {
    const r = validateQuoteForSmsSending(
      args({ line_items: [li({ takeoff_status: "assumed" })] }, true),
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateQuoteForSending — unpriced labour/other (audit item 2)", () => {
  const data = qd({
    line_items: [
      li({ unit_price: 50, line_total: 50 }),
      li({ type: "labour", description: "Labour", unit: "hour", quantity: 10, unit_price: 0, line_total: 0 }),
    ],
  });

  it("needs an acknowledgement before a $0 labour line can be sent", () => {
    const r = validateQuoteForSending({ status: "draft", total_amount: 57.5, quote_data: data });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("takeoff_unconfirmed");
    expect(
      validateQuoteForSending({ status: "draft", total_amount: 57.5, quote_data: data, acknowledged: true }).ok,
    ).toBe(true);
  });

  it("isUnpricedLine: real quantity at $0 or price-pending, any type", () => {
    expect(isUnpricedLine({ quantity: 10, unit_price: 0 })).toBe(true);
    expect(isUnpricedLine({ quantity: 1, unit_price: 20, is_missing_price: true })).toBe(true);
    expect(isUnpricedLine({ quantity: 0, unit_price: 0 })).toBe(false);
    expect(isUnpricedLine({ quantity: 2, unit_price: 75 })).toBe(false);
  });
});

// Audit item 6 follow-through: generation licenses scopes off the CLEANED
// transcript, so the review + send guards must read it too.
describe("licensing evidence includes the cleaned transcript", () => {
  const raw = "Put pink bats in the ceiling of the garage";
  const cleaned = "Put Pink Batts in the ceiling of the garage";
  const insulationLine = li({
    description: "Pink Batts R3.2 ceiling insulation",
    unit: "pack",
    quantity: 10,
    unit_price: 0,
    line_total: 0,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
  });

  it("scenario check: only the cleaned words license insulation", () => {
    expect(licensedFamiliesForDescription(raw).has("insulation")).toBe(false);
    expect(licensedFamiliesForDescription(cleaned).has("insulation")).toBe(true);
  });

  it("the review guard keeps a line the cleaned transcript licensed", () => {
    const data = qd({ line_items: [insulationLine], transcript: { raw, cleaned } });
    expect(guardQuoteForReview(data, { description: raw }).stripped).toEqual([]);
    // Legacy quote (no cleaned layer) behaves exactly as before.
    const legacy = qd({ line_items: [insulationLine] });
    expect(guardQuoteForReview(legacy, { description: raw }).stripped).toHaveLength(1);
  });

  it("the send gate's contradiction check agrees", () => {
    const data = qd({ line_items: [insulationLine], transcript: { raw, cleaned } });
    expect(assessQuoteContradictions(data, raw)).toEqual([]);
    expect(assessQuoteContradictions(qd({ line_items: [insulationLine] }), raw)).toHaveLength(1);
  });
});
