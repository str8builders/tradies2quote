import { describe, expect, it } from "vitest";
import { runTakeoff, type ParsedTakeoffResult } from "./aiTakeoffParser";
import {
  buildDimensionConfirmation,
  confirmAndRecalc,
  type ConfirmAndRecalcResult,
} from "./dimensionConfirmation";
import {
  dimensionDraft,
  dimensionEdits,
  invalidDimensions,
  previewDimensionConfirmation,
  recalculatedQuantities,
  type DimensionDraft,
} from "./dimensionConfirmationForm";
import type { DimensionConfirmation, QuoteData, QuoteLineItem } from "./quote-types";

// ─────────────────────────────────────────────────────────────────────────
// The confirmation form shared by the classic "confirm key dimensions" panel
// and the new job page's sizes sheet. The last block keeps a verbatim copy of
// the classic panel's inline rules from before the extraction and checks the
// shared ones give the very same answers.
// ─────────────────────────────────────────────────────────────────────────

const parsed = {
  type: "deck",
  input: { deckLengthM: 4.8, deckWidthM: 3, joistSpacingMm: 450, wastePercent: 10, includePiles: true },
  missingFields: [],
  assumptions: [],
  confidence: 0.4,
} as unknown as ParsedTakeoffResult;

function deckQuote(): QuoteData {
  const line_items: QuoteLineItem[] = runTakeoff(parsed)!.materials.map((m) => ({
    type: "material",
    description: m.name,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: 5,
    line_total: Math.round(m.quantity * 5 * 100) / 100,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    formula: m.formula,
    price_match_key: m.priceMatchKey,
    takeoff_status: "ok",
  }));
  line_items.push({ type: "labour", description: "Build the deck", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 });
  return {
    client: { name: "Jo", address: null, email: "jo@example.com", phone: null },
    job_summary: "Deck from a plan",
    line_items,
    materials_subtotal: 0,
    labour_subtotal: 0,
    markup_pct: 0,
    markup_amount: 0,
    subtotal_before_tax: 0,
    tax_amount: 0,
    total: 0,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "",
    notes: [],
    takeoff_inputs: parsed.input,
    dimension_confirmation: buildDimensionConfirmation({ isDrawing: true, parsed, noScale: true })!,
  };
}

const sizes = (data: QuoteData) => data.dimension_confirmation as DimensionConfirmation;

describe("dimensionDraft and dimensionEdits", () => {
  it("opens on every size as stored, and sends every size as typed", () => {
    const data = deckQuote();
    expect(dimensionDraft(sizes(data))).toEqual({ deckLengthM: "4.8", deckWidthM: "3" });
    expect(dimensionEdits(sizes(data), { deckLengthM: "7.2", deckWidthM: "3." })).toEqual([
      { key: "deckLengthM", value: 7.2 },
      { key: "deckWidthM", value: 3 },
    ]);
  });

  it("a missing or empty box goes as a number the recalculation ignores", () => {
    const [length, width] = dimensionEdits(sizes(deckQuote()), { deckLengthM: "" });
    expect(length.value).toBe(0);
    expect(width.value).toBeNaN();
  });

  it("no sizes: an empty form", () => {
    expect(dimensionDraft(null)).toEqual({});
    expect(dimensionEdits(undefined, { deckLengthM: "4" })).toEqual([]);
  });
});

describe("invalidDimensions", () => {
  it("lists the sizes that aren't a number above 0, in the order shown", () => {
    const dc = sizes(deckQuote());
    for (const bad of ["", "0", "0.", "-1", "abc"]) {
      expect(invalidDimensions(dc, { deckLengthM: bad, deckWidthM: "3" }).map((d) => d.key), bad).toEqual(["deckLengthM"]);
    }
    expect(invalidDimensions(dc, { deckLengthM: "", deckWidthM: "0" }).map((d) => d.label)).toEqual(["Deck length", "Deck width"]);
    expect(invalidDimensions(dc, { deckLengthM: "0.5", deckWidthM: "12." })).toEqual([]);
    expect(invalidDimensions(null, {})).toEqual([]);
  });
});

describe("previewDimensionConfirmation", () => {
  it("is confirmAndRecalc before anyone is recorded as confirming", () => {
    const data = deckQuote();
    const edits = [
      { key: "deckLengthM", value: 7.2 },
      { key: "deckWidthM", value: 3 },
    ];
    const preview = previewDimensionConfirmation(data, edits)!;
    expect(preview).toEqual(confirmAndRecalc(data, edits, { confirmedBy: "", confirmedAt: "" }));
    expect(preview.changed).toBe(true);
    expect(preview.dimension_confirmation.confirmed_by).toBe("");
  });

  it("null when there is nothing stored to recalculate from", () => {
    const data = deckQuote();
    delete data.takeoff_inputs;
    expect(previewDimensionConfirmation(data, [])).toBeNull();
  });
});

describe("recalculatedQuantities", () => {
  const edits = (length: number) => [
    { key: "deckLengthM", value: length },
    { key: "deckWidthM", value: 3 },
  ];

  it("a corrected size: each calculator line beside the one it replaces, matched by price key", () => {
    const data = deckQuote();
    const rows = recalculatedQuantities(previewDimensionConfirmation(data, edits(7.2))!, data.line_items);
    const joists = rows.find((r) => r.line.price_match_key === "deck-joists")!;
    // The description moves with the count; the price key still finds it.
    expect(joists.line.description).toBe("Deck joists (12 × 4.8m stock)");
    expect(joists.before?.description).toBe("Deck joists (9 × 4.8m stock)");
    expect(joists.changed).toBe(true);
    const nails = rows.find((r) => r.line.price_match_key === "joist-hanger-nails")!;
    expect(nails.changed).toBe(false);
    expect(nails.before).not.toBeNull();
    expect(rows.some((r) => r.line.type === "labour")).toBe(false);
  });

  it("sizes confirmed as read: nothing is marked as changing", () => {
    const data = deckQuote();
    const rows = recalculatedQuantities(previewDimensionConfirmation(data, edits(4.8))!, data.line_items);
    expect(rows.length).toBe(7);
    expect(rows.every((r) => !r.changed && r.before !== null)).toBe(true);
  });

  it("a line with nothing to replace stands alone; without a price key the description matches", () => {
    const line = (o: Partial<QuoteLineItem>): QuoteLineItem => ({
      type: "material", description: "Bearer", quantity: 4, unit: "lengths", unit_price: 0, line_total: 0, is_calculated_takeoff: true, ...o,
    });
    const preview: ConfirmAndRecalcResult = {
      line_items: [line({ quantity: 5 }), line({ description: "Brand new", quantity: 2 })],
      dimension_confirmation: sizes(deckQuote()),
      changed: true,
    };
    const [bearer, fresh] = recalculatedQuantities(preview, [line({}), line({ description: "Brand new", is_calculated_takeoff: false })]);
    expect(bearer).toMatchObject({ changed: true, before: { quantity: 4 } });
    expect(fresh).toMatchObject({ changed: false, before: null });
  });
});

/** The classic panel's inline rules, verbatim from before the extraction. */
const classic = {
  draft: (dc: DimensionConfirmation | null | undefined): Record<string, string> =>
    Object.fromEntries((dc?.dimensions ?? []).map((d) => [d.key, String(d.value)])),
  edits: (dc: DimensionConfirmation | null, dimDraft: Record<string, string>) =>
    (dc?.dimensions ?? []).map((d) => ({ key: d.key, value: Number(dimDraft[d.key]) })),
  error(dc: DimensionConfirmation, dimDraft: Record<string, string>): string {
    for (const d of dc.dimensions) {
      const v = Number(dimDraft[d.key]);
      if (!Number.isFinite(v) || v <= 0) return `${d.label} must be a positive number.`;
    }
    return "";
  },
  rows: (dimPreview: ConfirmAndRecalcResult, items: QuoteLineItem[]) =>
    dimPreview.line_items
      .filter((i) => i.is_calculated_takeoff)
      .map((i) => {
        const before = items.find(
          (x) => x.is_calculated_takeoff && (x.price_match_key ?? x.description) === (i.price_match_key ?? i.description),
        );
        const changed = dimPreview.changed && before != null && Math.abs((before.quantity ?? 0) - i.quantity) > 1e-9;
        return { i, struck: changed && before ? before.quantity : null };
      }),
};

describe("the classic panel's answers are unchanged", () => {
  const drafts: DimensionDraft[] = [
    { deckLengthM: "4.8", deckWidthM: "3" },
    { deckLengthM: "7.2", deckWidthM: "3" },
    { deckLengthM: "7.2", deckWidthM: "4.25" },
    { deckLengthM: "2400", deckWidthM: "3" },
    { deckLengthM: "", deckWidthM: "3" },
    { deckLengthM: "0", deckWidthM: "-2" },
    { deckWidthM: "3.5" },
  ];

  it.each(drafts)("draft %o", (draft) => {
    const data = deckQuote();
    const dc = sizes(data);
    expect(dimensionDraft(dc)).toEqual(classic.draft(dc));
    expect(dimensionEdits(dc, draft)).toEqual(classic.edits(dc, draft));
    const invalid = invalidDimensions(dc, draft)[0];
    expect(invalid ? `${invalid.label} must be a positive number.` : "").toBe(classic.error(dc, draft));
    const preview = previewDimensionConfirmation(data, dimensionEdits(dc, draft))!;
    expect(preview).toEqual(confirmAndRecalc(data, classic.edits(dc, draft), { confirmedBy: "", confirmedAt: "" }));
    expect(
      recalculatedQuantities(preview, data.line_items).map(({ line, before, changed }) => ({
        i: line,
        struck: changed && before ? before.quantity : null,
      })),
    ).toEqual(classic.rows(preview, data.line_items));
  });
});
