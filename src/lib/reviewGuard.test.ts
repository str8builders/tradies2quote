// ─────────────────────────────────────────────────────────────────────────
// REVIEW GUARD + QUOTE QA CONTRADICTIONS — regression pack (deterministic).
//
// Rules locked here:
//   - sourceless/invalid lines never render as normal review values,
//   - machine-origin deck/insulation lines without a license are stripped
//     in review and BLOCK send,
//   - user-confirmed lines are never stripped or blocked (rule 3),
//   - legacy AI lines are normalized into the confirm workflow, not lost,
//   - blocked lines carrying a quantity block send (contradiction).
// ─────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from "vitest";
import {
  classifyLineProvenance,
  guardQuoteForReview,
  licensedFamiliesForDescription,
  t2qcalLicensedFamily,
} from "./reviewGuard";
import {
  assessQuoteContradictions,
  validateQuoteForSending,
} from "./quote-validation";
import { computeQuoteTotals } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

const li = (o: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Item",
  quantity: 2,
  unit: "each",
  unit_price: 10,
  line_total: 20,
  ...o,
});

function qd(items: QuoteLineItem[], o: Partial<QuoteData> = {}): QuoteData {
  const totals = computeQuoteTotals(items, 0, 15);
  return {
    client: { name: "Jane", address: null, email: "j@e.com", phone: null },
    job_summary: "frame a partition wall 4m x 2.4m",
    line_items: items,
    markup_pct: 0,
    ...totals,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "",
    notes: [],
    ...o,
  };
}

describe("supplier discount / credit lines", () => {
  it("keeps a negative line the supplier quote itself printed (a trade discount)", () => {
    const discount = li({ description: "Trade discount", quantity: 1, unit_price: -25, line_total: -25, source_line_total: -25, source_unit_price: -25 });
    expect(classifyLineProvenance(discount)).toBe("supplier");
    const r = guardQuoteForReview(qd([li(), discount]));
    expect(r.stripped).toEqual([]);
    expect(r.data.line_items).toHaveLength(2);
  });

  it("still strips a negative price with no supplier evidence", () => {
    expect(classifyLineProvenance(li({ unit_price: -25 }))).toBe("invalid");
    expect(classifyLineProvenance(li({ unit_price: -25, source_line_total: 20 }))).toBe("invalid");
  });
});

describe("classifyLineProvenance", () => {
  it("maps every provenance correctly", () => {
    expect(classifyLineProvenance(li({ quantity_source: "calculator" }))).toBe("calculated");
    expect(classifyLineProvenance(li({ is_calculated_takeoff: true }))).toBe("calculated");
    expect(classifyLineProvenance(li({ quantity_source: "supplier" }))).toBe("supplier");
    expect(classifyLineProvenance(li({ source_line_total: 20 }))).toBe("supplier");
    expect(classifyLineProvenance(li({ quantity_source: "user" }))).toBe("user_confirmed");
    expect(classifyLineProvenance(li({ quantity_source: "ai", quantity_confirmed: true }))).toBe("user_confirmed");
    expect(classifyLineProvenance(li({ quantity_source: "ai" }))).toBe("ai_unconfirmed");
    // Legacy AI line (pre-provenance fields).
    expect(classifyLineProvenance(li({ is_ai_estimated: true }))).toBe("ai_unconfirmed");
    // Manual / labour lines: user input by construction.
    expect(classifyLineProvenance(li())).toBe("user_confirmed");
    expect(classifyLineProvenance(li({ type: "labour" }))).toBe("user_confirmed");
    expect(classifyLineProvenance(li({ takeoff_status: "blocked", quantity: 0, line_total: 0 }))).toBe("blocked");
    expect(classifyLineProvenance(li({ quantity: Number.NaN }))).toBe("invalid");
    expect(classifyLineProvenance(li({ unit_price: -5 }))).toBe("invalid");
  });
});

describe("licensedFamiliesForDescription", () => {
  it("deck noun licenses deck; bare joists do not; scan marker does", () => {
    expect(licensedFamiliesForDescription("build a deck 4x6m").has("deck")).toBe(true);
    expect(licensedFamiliesForDescription("fence with 100x50 joists").has("deck")).toBe(false);
    expect(licensedFamiliesForDescription("[T2Q_PLAN] type=deck joists per plan").has("deck")).toBe(true);
  });
  it("insulation licenses only with insulation evidence", () => {
    expect(licensedFamiliesForDescription("insulate the exterior walls 24 m²").has("insulation")).toBe(true);
    expect(licensedFamiliesForDescription("frame a wall 4m x 2.4m").has("insulation")).toBe(false);
  });
});

describe("T2QCAL exact source licences", () => {
  it("licenses only the exact audited source-key family", () => {
    expect(t2qcalLicensedFamily({ t2qcal_source_key: "deck-boards.lineal-order" })).toBe("deck");
    expect(t2qcalLicensedFamily({ t2qcal_source_key: "insulation-batts.packs-order" })).toBe("insulation");
    expect(t2qcalLicensedFamily({ t2qcal_source_key: "deck-boards.spoof" })).toBeNull();
    expect(t2qcalLicensedFamily({ t2qcal_source_key: "insulation-batts.packs-order-extra" })).toBeNull();
  });
});

describe("guardQuoteForReview — strip rules", () => {
  it("strips structurally invalid lines and reports them", () => {
    const data = qd([li(), li({ description: "Garbage", quantity: Number.NaN })]);
    const res = guardQuoteForReview(data);
    expect(res.data.line_items.length).toBe(1);
    expect(res.stripped).toEqual([
      { description: "Garbage", reason: "invalid_values" },
    ]);
  });

  it("strips a CALCULATED deck line on a job with no deck evidence", () => {
    const data = qd([
      li({ description: "Deck joists H3.2 90x45", quantity_source: "calculator" }),
      li({ description: "GIB 10mm sheets", quantity_source: "calculator" }),
    ]);
    const res = guardQuoteForReview(data, { description: "frame a partition wall 4m x 2.4m, line with GIB" });
    expect(res.data.line_items.map((l) => l.description)).toEqual(["GIB 10mm sheets"]);
    expect(res.stripped[0].reason).toBe("unlicensed_deck");
  });

  it("keeps the same deck line when the job IS a deck job", () => {
    const data = qd([li({ description: "Deck joists H3.2 90x45", quantity_source: "calculator" })]);
    const res = guardQuoteForReview(data, { description: "build a deck 4m x 6m" });
    expect(res.stripped).toEqual([]);
    expect(res.data.line_items.length).toBe(1);
  });

  it("keeps an exact typed T2QCAL deck line even under a generic multi-tool job name", () => {
    const data = qd([li({
      description: "Deck board layout — Decking lineal length to order",
      quantity_source: "calculator",
      t2qcal_source_key: "deck-boards.lineal-order",
    })]);
    const res = guardQuoteForReview(data, { description: "Smith job" });
    expect(res.stripped).toEqual([]);
    expect(res.data.line_items).toHaveLength(1);
  });

  it("does not let a deck key license an insulation line", () => {
    const data = qd([li({
      description: "Pink Batts R2.2",
      quantity_source: "calculator",
      t2qcal_source_key: "deck-boards.lineal-order",
    })]);
    expect(guardQuoteForReview(data, { description: "Smith job" }).stripped[0].reason)
      .toBe("unlicensed_insulation");
  });

  it("NEVER strips a user-confirmed deck line, licensed or not (rule 3)", () => {
    const data = qd([li({ description: "Deck joists H3.2", quantity_source: "user" })]);
    const res = guardQuoteForReview(data, { description: "fence repair job" });
    expect(res.stripped).toEqual([]);
    expect(res.data.line_items.length).toBe(1);
  });

  it("strips an AI insulation line on a job with no insulation scope", () => {
    const data = qd([li({ description: "Pink Batts R2.2", quantity_source: "ai" })]);
    const res = guardQuoteForReview(data, { description: "frame a wall 4m x 2.4m" });
    expect(res.stripped[0].reason).toBe("unlicensed_insulation");
  });

  it("normalizes legacy AI lines into the confirm workflow instead of stripping", () => {
    const data = qd([li({ description: "Exterior paint 10L", is_ai_estimated: true })]);
    const res = guardQuoteForReview(data);
    expect(res.normalized).toBe(1);
    expect(res.stripped).toEqual([]);
    const line = res.data.line_items[0];
    expect(line.quantity_source).toBe("ai");
    expect(line.quantity_confirmed).toBe(false);
  });

  it("clean quotes pass through untouched (same reference, zero noise)", () => {
    const data = qd([li(), li({ type: "labour", description: "Install" })]);
    const res = guardQuoteForReview(data);
    expect(res.data).toBe(data);
    expect(res.stripped).toEqual([]);
    expect(res.normalized).toBe(0);
  });
});

describe("Quote QA contradictions — send gate", () => {
  it("blocked line carrying a quantity blocks (no auto-fix)", () => {
    const items = [li({ takeoff_status: "blocked", quantity: 5, line_total: 50 })];
    const reasons = assessQuoteContradictions(qd(items));
    expect(reasons.join(" ")).toMatch(/blocked line/i);
  });

  it("machine deck line without deck evidence blocks send end-to-end", () => {
    const items = [li({ description: "Deck joists H3.2", quantity_source: "calculator" })];
    const res = validateQuoteForSending({
      status: "draft",
      total_amount: 23,
      quote_data: qd(items),
      description: "fence with palings, 12m run",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("takeoff_blocked");
      expect((res.reasons ?? []).join(" ")).toMatch(/no deck evidence/i);
    }
  });

  it("same deck line passes when the description licenses deck", () => {
    const items = [li({ description: "Deck joists H3.2", quantity_source: "calculator" })];
    const reasons = assessQuoteContradictions(qd(items), "build a deck 4x6m");
    expect(reasons).toEqual([]);
  });

  it("exact T2QCAL deck evidence passes the independent send-time contradiction guard", () => {
    const items = [li({
      description: "Deck board layout — Decking lineal length to order",
      quantity_source: "calculator",
      t2qcal_source_key: "deck-boards.lineal-order",
    })];
    expect(assessQuoteContradictions(qd(items), "Smith job")).toEqual([]);
  });

  it("user-confirmed deck line never blocks (rule 3)", () => {
    const items = [li({ description: "Deck joists H3.2", quantity_source: "user" })];
    expect(assessQuoteContradictions(qd(items), "fence repair")).toEqual([]);
  });

  it("falls back to job_summary when no description is supplied", () => {
    const items = [li({ description: "Pink Batts R2.2", quantity_source: "calculator" })];
    const blocked = assessQuoteContradictions(
      qd(items, { job_summary: "frame a wall 4m x 2.4m" }),
    );
    expect(blocked.length).toBe(1);
    const allowed = assessQuoteContradictions(
      qd(items, { job_summary: "insulate the exterior walls 24 m²" }),
    );
    expect(allowed).toEqual([]);
  });
});
