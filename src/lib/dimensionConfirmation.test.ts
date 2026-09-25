import { describe, expect, it } from "vitest";
import {
  buildDimensionConfirmation,
  confirmAndRecalc,
  DIM_CONFIRM_LARGE_AREA_M2,
  DIM_CONFIRM_LOW_CONFIDENCE,
} from "./dimensionConfirmation";
import { runTakeoff } from "./aiTakeoffParser";
import type { ParsedTakeoffResult } from "./aiTakeoffParser";
import type { QuoteData, QuoteLineItem } from "./quote-types";

// ─────────────────────────────────────────────────────────────────────────
// #1 — Drawing key-dimension confirmation.
//
// RULE MATRIX (the source of truth for this chunk).
//
// A) buildDimensionConfirmation({ isDrawing, parsed, noScale }) → DimensionConfirmation | null
//    Confirmation is ONLY ever produced for risky DRAWINGS. Voice/typed
//    inputs and safe drawings produce null — never any friction.
//
//    | scenario                                   | result                                      |
//    |--------------------------------------------|---------------------------------------------|
//    | isDrawing = false (voice/typed)            | null                                        |
//    | drawing, parsed.type = "unknown"           | null (no key dimensions to confirm)         |
//    | drawing, confidence ≥ 0.7, area < 40,      | null (safe → no friction)                   |
//    |   no plan/text disagreement, scale present |                                             |
//    | drawing, confidence < 0.7                  | required, reason "low_confidence"           |
//    | drawing, plan disagreed with dims text     | required, reason "plan_text_disagree"       |
//    | drawing, noScale = true                    | required, reason "no_scale"                 |
//    | drawing, plan area ≥ 40 m²                  | required, reason "large_quantity"           |
//    | several triggers at once                   | required, all matching reasons (deduped)    |
//    Any required result ALWAYS lists the key dimensions (key/label/value/
//    unit), each confirmed:false, and records takeoff_type.
//
// B) confirmAndRecalc(quoteData, edits, { confirmedBy, confirmedAt })
//    | scenario                          | result                                          |
//    |-----------------------------------|-------------------------------------------------|
//    | edit equals stored value          | changed:false, quantities unchanged, all marked |
//    |                                   |   confirmed, confirmed_by/at stamped            |
//    | edit changes a dimension          | changed:true, deterministic recompute of the    |
//    |                                   |   calculator lines, prices preserved, non-calc  |
//    |                                   |   (labour) lines untouched, all marked confirmed|
//    | no takeoff_inputs / no            | null                                            |
//    |   dimension_confirmation present  |                                                 |
// ─────────────────────────────────────────────────────────────────────────

const deckParsed = (
  o: Partial<{
    input: Record<string, number | boolean>;
    assumptions: string[];
    confidence: number;
  }> = {},
): ParsedTakeoffResult =>
  ({
    type: "deck",
    input: {
      deckLengthM: 4.8,
      deckWidthM: 3.0,
      joistSpacingMm: 450,
      wastePercent: 10,
      includePiles: true,
      ...(o.input ?? {}),
    },
    missingFields: [],
    assumptions: o.assumptions ?? [],
    confidence: o.confidence ?? 0.9,
  }) as unknown as ParsedTakeoffResult;

describe("buildDimensionConfirmation — when confirmation is required", () => {
  it("never produces confirmation for a voice/typed (non-drawing) input", () => {
    const r = buildDimensionConfirmation({
      isDrawing: false,
      parsed: deckParsed({ confidence: 0.1 }), // even very low confidence
    });
    expect(r).toBeNull();
  });

  it("produces nothing for an unknown takeoff type (no key dimensions)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: {
        type: "unknown",
        input: {},
        missingFields: [],
        assumptions: [],
        confidence: 0.2,
      } as unknown as ParsedTakeoffResult,
    });
    expect(r).toBeNull();
  });

  it("produces NO friction for a safe drawing (high confidence, small, scaled, agrees)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: 0.95 }), // 4.8×3 = 14.4 m² < 40
      noScale: false,
    });
    expect(r).toBeNull();
  });

  it("requires confirmation when parsed confidence is below the threshold", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: DIM_CONFIRM_LOW_CONFIDENCE - 0.2 }),
    });
    expect(r).not.toBeNull();
    expect(r!.required).toBe(true);
    expect(r!.reasons).toContain("low_confidence");
    expect(r!.takeoff_type).toBe("deck");
  });

  it("requires confirmation when the AI plan disagreed with the dimensions text", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({
        confidence: 0.95,
        assumptions: [
          "AI's structured plan (4.8m × 3m) disagreed with the dimensions text (6m × 4m). Using the dimensions text.",
        ],
      }),
    });
    expect(r!.required).toBe(true);
    expect(r!.reasons).toContain("plan_text_disagree");
  });

  it("requires confirmation when the drawing had no scale", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: 0.95 }),
      noScale: true,
    });
    expect(r!.required).toBe(true);
    expect(r!.reasons).toContain("no_scale");
  });

  it("requires confirmation when the takeoff drives a large quantity (big footprint)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({
        confidence: 0.95,
        input: { deckLengthM: 8, deckWidthM: 6 }, // 48 m² ≥ 40
      }),
    });
    expect(r!.required).toBe(true);
    expect(r!.reasons).toContain("large_quantity");
  });

  it("uses DIM_CONFIRM_LARGE_AREA_M2 as the large-quantity threshold", () => {
    // Just under the threshold is safe; just over requires confirmation.
    const under = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({
        confidence: 0.95,
        input: { deckLengthM: DIM_CONFIRM_LARGE_AREA_M2 / 10 - 0.1, deckWidthM: 10 },
      }),
    });
    expect(under).toBeNull();
    const over = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({
        confidence: 0.95,
        input: { deckLengthM: DIM_CONFIRM_LARGE_AREA_M2 / 10 + 0.1, deckWidthM: 10 },
      }),
    });
    expect(over!.required).toBe(true);
    expect(over!.reasons).toContain("large_quantity");
  });

  it("collects every triggered reason at once (deduped)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({
        confidence: 0.3,
        input: { deckLengthM: 9, deckWidthM: 6 }, // 54 m²
        assumptions: ["… disagreed with the dimensions text …"],
      }),
      noScale: true,
    });
    expect(r!.reasons).toEqual(
      expect.arrayContaining([
        "low_confidence",
        "plan_text_disagree",
        "no_scale",
        "large_quantity",
      ]),
    );
    // No duplicates.
    expect(new Set(r!.reasons).size).toBe(r!.reasons.length);
  });
});

describe("buildDimensionConfirmation — the dimensions it asks to confirm", () => {
  it("lists each key dimension with key/label/value/unit, all unconfirmed", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: 0.4 }),
    })!;
    expect(r.dimensions.length).toBeGreaterThan(0);
    for (const d of r.dimensions) {
      expect(typeof d.key).toBe("string");
      expect(typeof d.label).toBe("string");
      expect(typeof d.value).toBe("number");
      expect(d.unit).toBe("m");
      expect(d.confirmed).toBe(false);
    }
    const byKey = Object.fromEntries(r.dimensions.map((d) => [d.key, d.value]));
    expect(byKey.deckLengthM).toBe(4.8);
    expect(byKey.deckWidthM).toBe(3.0);
  });

  it("starts unconfirmed (no confirmed_by / confirmed_at yet)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: 0.4 }),
    })!;
    expect(r.confirmed_by ?? null).toBeNull();
    expect(r.confirmed_at ?? null).toBeNull();
  });

  it("uses calculator input field names as keys (so recompute is direct)", () => {
    const r = buildDimensionConfirmation({
      isDrawing: true,
      parsed: deckParsed({ confidence: 0.4 }),
    })!;
    const keys = r.dimensions.map((d) => d.key).sort();
    expect(keys).toEqual(["deckLengthM", "deckWidthM"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// confirmAndRecalc — confirm / edit drives a deterministic recompute.
// ─────────────────────────────────────────────────────────────────────────

function deckQuoteFixture(price = 5): QuoteData {
  const parsed = deckParsed({ confidence: 0.4 });
  const calc = runTakeoff(parsed)!;
  const line_items: QuoteLineItem[] = calc.materials.map((m) => ({
    type: "material",
    description: m.name,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: price,
    line_total: Math.round(m.quantity * price * 100) / 100,
    library_id: null,
    is_ai_estimated: false,
    is_missing_price: false,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    formula: m.formula,
    price_match_key: m.priceMatchKey,
    takeoff_status: "ok",
  }));
  // A tradie-added labour line that must survive recompute untouched.
  line_items.push({
    type: "labour",
    description: "Install decking",
    quantity: 1,
    unit: "job",
    unit_price: 800,
    line_total: 800,
  });
  return {
    client: { name: "Jane", address: null, email: "j@e.com", phone: null },
    job_summary: "deck",
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
    dimension_confirmation: buildDimensionConfirmation({
      isDrawing: true,
      parsed,
    })!,
  };
}

const META = { confirmedBy: "user-123", confirmedAt: "2026-05-22T00:00:00.000Z" };

const calcQty = (items: QuoteLineItem[]): number =>
  items
    .filter((i) => i.is_calculated_takeoff)
    .reduce((s, i) => s + i.quantity, 0);

describe("confirmAndRecalc", () => {
  it("returns null when there's nothing to recalc (no dimension_confirmation)", () => {
    const qd = deckQuoteFixture();
    delete qd.dimension_confirmation;
    const r = confirmAndRecalc(qd, [{ key: "deckLengthM", value: 4.8 }], META);
    expect(r).toBeNull();
  });

  it("confirm without edits: changed:false, quantities unchanged, all stamped confirmed", () => {
    const qd = deckQuoteFixture();
    const before = calcQty(qd.line_items);
    const r = confirmAndRecalc(
      qd,
      [
        { key: "deckLengthM", value: 4.8 },
        { key: "deckWidthM", value: 3.0 },
      ],
      META,
    )!;
    expect(r.changed).toBe(false);
    expect(calcQty(r.line_items)).toBeCloseTo(before, 5);
    expect(r.dimension_confirmation.dimensions.every((d) => d.confirmed)).toBe(true);
    expect(r.dimension_confirmation.confirmed_by).toBe("user-123");
    expect(r.dimension_confirmation.confirmed_at).toBe(META.confirmedAt);
  });

  it("editing a dimension triggers a deterministic recompute (bigger deck → more material)", () => {
    const qd = deckQuoteFixture();
    const before = calcQty(qd.line_items);
    const r = confirmAndRecalc(
      qd,
      [
        { key: "deckLengthM", value: 7.2 }, // 4.8 → 7.2
        { key: "deckWidthM", value: 3.0 },
      ],
      META,
    )!;
    expect(r.changed).toBe(true);
    expect(calcQty(r.line_items)).toBeGreaterThan(before);
    // The edited value is recorded and marked confirmed.
    const len = r.dimension_confirmation.dimensions.find(
      (d) => d.key === "deckLengthM",
    )!;
    expect(len.value).toBe(7.2);
    expect(len.confirmed).toBe(true);
  });

  it("preserves library prices on recompute (price keyed by price_match_key)", () => {
    const qd = deckQuoteFixture(5);
    const r = confirmAndRecalc(
      qd,
      [{ key: "deckLengthM", value: 7.2 }, { key: "deckWidthM", value: 3.0 }],
      META,
    )!;
    for (const item of r.line_items.filter((i) => i.is_calculated_takeoff)) {
      // Every recomputed calc line keeps the $5 unit price from before.
      expect(item.unit_price).toBe(5);
      expect(item.line_total).toBeCloseTo(
        Math.round(item.quantity * 5 * 100) / 100,
        5,
      );
    }
  });

  it("never touches non-calculator (labour) lines on recompute", () => {
    const qd = deckQuoteFixture();
    const r = confirmAndRecalc(
      qd,
      [{ key: "deckLengthM", value: 7.2 }, { key: "deckWidthM", value: 3.0 }],
      META,
    )!;
    const labour = r.line_items.find((i) => i.type === "labour")!;
    expect(labour.quantity).toBe(1);
    expect(labour.unit_price).toBe(800);
    expect(labour.line_total).toBe(800);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Audit item 4 — a correction the calculator can't use must NOT be recorded
// as confirmed while the old quantities stay on the quote. Before: the new
// value was stored with confirmed:true, the send gate unblocked, and the
// line items still reflected the old size.
// ─────────────────────────────────────────────────────────────────────────

function claddingQuoteFixture(): QuoteData {
  const parsed = {
    type: "cladding",
    input: { wallLengthM: 12, wallHeightM: 2.4, wastePercent: 10 },
    missingFields: [],
    assumptions: [],
    confidence: 0.4,
  } as unknown as ParsedTakeoffResult;
  const calc = runTakeoff(parsed)!;
  return {
    ...deckQuoteFixture(),
    line_items: calc.materials.map((m) => ({
      type: "material" as const,
      description: m.name,
      quantity: m.quantity,
      unit: m.unit,
      unit_price: 0,
      line_total: 0,
      is_calculated_takeoff: true,
      quantity_source: "calculator" as const,
      formula: m.formula,
      price_match_key: m.priceMatchKey,
      takeoff_status: "ok" as const,
    })),
    takeoff_inputs: parsed.input,
    dimension_confirmation: buildDimensionConfirmation({ isDrawing: true, parsed })!,
  };
}

describe("confirmAndRecalc — a size the calculator can't use (item 4)", () => {
  it("a 2400 m wall height is NOT confirmed (was stored as confirmed with the old quantities) and says 'did you mean 2400 mm?'", () => {
    const qd = claddingQuoteFixture();
    const r = confirmAndRecalc(
      qd,
      [
        { key: "wallLengthM", value: 12 },
        { key: "wallHeightM", value: 2400 },
      ],
      META,
    )!;
    expect(r.problem).toBe("That size looks wrong — Wall height 2400 m? Did you mean 2400 mm (2.4 m)?");
    expect(r.changed).toBe(false);
    // Nothing confirmed, the old value kept, nobody stamped.
    const h = r.dimension_confirmation.dimensions.find((d) => d.key === "wallHeightM")!;
    expect(h.value).toBe(2.4);
    expect(r.dimension_confirmation.dimensions.every((d) => d.confirmed === false)).toBe(true);
    expect(r.dimension_confirmation.confirmed_by ?? null).toBeNull();
    // Quantities untouched.
    expect(r.line_items).toEqual(qd.line_items);
  });

  it("a 4800 m deck length is refused the same way (was confirmed: true at 4800)", () => {
    const qd = deckQuoteFixture();
    const r = confirmAndRecalc(
      qd,
      [
        { key: "deckLengthM", value: 4800 },
        { key: "deckWidthM", value: 3.0 },
      ],
      META,
    )!;
    expect(r.problem).toBe("That size looks wrong — Deck length 4800 m? Did you mean 4800 mm (4.8 m)?");
    const len = r.dimension_confirmation.dimensions.find((d) => d.key === "deckLengthM")!;
    expect(len).toMatchObject({ value: 4.8, confirmed: false });
  });

  it("a size with no sensible mm reading gets the plain band reason", () => {
    const qd = claddingQuoteFixture();
    const r = confirmAndRecalc(qd, [{ key: "wallHeightM", value: 24 }], META)!;
    expect(r.problem).toBe("That size looks wrong — Wall height 24 m is more than 6 m. Check it and try again.");
    expect(r.dimension_confirmation.dimensions.every((d) => d.confirmed === false)).toBe(true);
  });

  it("a plausible size the stored inputs still can't calculate keeps everything unconfirmed and says so", () => {
    const qd = deckQuoteFixture();
    // Stored inputs from an old quote that lost the wall's GIB sides: the
    // wall calculator can't run even with a sane size.
    qd.dimension_confirmation = {
      ...qd.dimension_confirmation!,
      takeoff_type: "wall",
      dimensions: [
        { key: "wallLengthM", label: "Wall length", value: 10, unit: "m", confirmed: false },
        { key: "wallHeightM", label: "Wall height", value: 2.4, unit: "m", confirmed: false },
      ],
    };
    qd.takeoff_inputs = { wallLengthM: 10, wallHeightM: 2.4 };
    const r = confirmAndRecalc(qd, [{ key: "wallLengthM", value: 12 }], META)!;
    expect(r.problem).toMatch(/couldn't recalculate the materials with those sizes/i);
    expect(r.changed).toBe(false);
    expect(r.dimension_confirmation.dimensions.find((d) => d.key === "wallLengthM")).toMatchObject({
      value: 10,
      confirmed: false,
    });
    expect(r.line_items).toEqual(qd.line_items);
  });

  it("a usable correction still recomputes and confirms (no problem)", () => {
    const qd = claddingQuoteFixture();
    const r = confirmAndRecalc(qd, [{ key: "wallLengthM", value: 62 }, { key: "wallHeightM", value: 2.4 }], META)!;
    expect(r.problem).toBeUndefined();
    expect(r.changed).toBe(true);
    expect(r.line_items.find((i) => i.price_match_key === "weatherboard-cladding")?.quantity).toBe(228);
    expect(r.dimension_confirmation.dimensions.every((d) => d.confirmed)).toBe(true);
  });
});
