import { describe, expect, it } from "vitest";
import { runTakeoff, type ParsedTakeoffResult } from "@/lib/aiTakeoffParser";
import { buildDimensionConfirmation } from "@/lib/dimensionConfirmation";
import { dimensionDraft } from "@/lib/dimensionConfirmationForm";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import type { ConfirmableDimension, DimensionConfirmation, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { withLines } from "./lines";
import { checkSizes, sizeChanged, sizeHint, sizeReasons, sizesErrorMessage, sizesSavedMessage, withSizes } from "./sizes";

const parsed = {
  type: "deck",
  input: { deckLengthM: 4.8, deckWidthM: 3, joistSpacingMm: 450, wastePercent: 10, includePiles: true },
  missingFields: [],
  assumptions: [],
  confidence: 0.4,
} as unknown as ParsedTakeoffResult;

/** A deck quote written from a plan, with its sizes still to confirm. */
function deckQuote(): QuoteData {
  const lines: QuoteLineItem[] = runTakeoff(parsed)!.materials.map((m) => ({
    type: "material",
    description: m.name,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: 0,
    line_total: 0,
    is_missing_price: true,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    price_match_key: m.priceMatchKey,
    takeoff_status: "ok",
  }));
  return {
    ...withLines(
      {
        client: { name: "Sam Taylor", address: null, email: "sam@example.invalid", phone: null },
        job_summary: "Deck from a plan",
        line_items: [],
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
      },
      lines,
    ),
    takeoff_inputs: parsed.input,
    dimension_confirmation: buildDimensionConfirmation({ isDrawing: true, parsed, noScale: true }),
  };
}

const LENGTH: ConfirmableDimension = { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed: false };

describe("withSizes", () => {
  it("keeps the very same quote while the sizes are the stored ones", () => {
    const data = deckQuote();
    expect(withSizes(data, data.dimension_confirmation ?? null)).toBe(data);
    const voice = { ...data, dimension_confirmation: undefined };
    expect(withSizes(voice, null)).toBe(voice);
  });

  it("carries sizes confirmed on the page into every later save", () => {
    const data = deckQuote();
    const confirmed: DimensionConfirmation = {
      ...data.dimension_confirmation!,
      dimensions: data.dimension_confirmation!.dimensions.map((d) => ({ ...d, confirmed: true })),
    };
    const next = withSizes(data, confirmed);
    expect(next.dimension_confirmation).toBe(confirmed);
    expect(next.line_items).toBe(data.line_items);
  });
});

describe("sizeReasons", () => {
  it("says why in plain words, in the stored order", () => {
    expect(sizeReasons(["no_scale", "low_confidence"])).toEqual([
      "We couldn't find a scale on the drawing.",
      "The drawing was hard to read.",
    ]);
    expect(sizeReasons(["plan_text_disagree", "large_quantity"])).toEqual([
      "The drawing and the sizes written on it didn't agree.",
      "It's a big job, so a small mistake in a size costs a lot.",
    ]);
  });

  it("never shows a code it has no words for", () => {
    expect(sizeReasons(["something_new", "toString", "constructor"])).toEqual([]);
    expect(sizeReasons(null)).toEqual([]);
  });
});

describe("sizeChanged and sizeHint", () => {
  it("a different size above 0 is a change, and the hint says what the drawing said", () => {
    expect(sizeChanged(LENGTH, "7.2")).toBe(true);
    expect(sizeHint(LENGTH, "7.2")).toBe("Your drawing said 4.8 m.");
  });

  it("the same size, however it's typed, or nothing usable, is not", () => {
    for (const typed of ["4.8", "4.80", "4.8.", "", "0", undefined]) {
      expect(sizeChanged(LENGTH, typed), String(typed)).toBe(false);
      expect(sizeHint(LENGTH, typed)).toBeUndefined();
    }
  });
});

describe("checkSizes", () => {
  it("as read off the drawing: nothing edited, nothing missing, no materials to show", () => {
    const data = deckQuote();
    const check = checkSizes(data, dimensionDraft(data.dimension_confirmation));
    expect(check.sizes.map((s) => s.label)).toEqual(["Deck length", "Deck width"]);
    expect(check.edited).toBe(false);
    expect(check.invalid).toEqual([]);
    expect(check.preview?.changed).toBe(false);
    expect(check.rows).toEqual([]);
  });

  it("a corrected size: the materials worked out again, beside the old quantities", () => {
    const check = checkSizes(deckQuote(), { deckLengthM: "7.2", deckWidthM: "3" });
    expect(check.edited).toBe(true);
    expect(check.edits).toEqual([
      { key: "deckLengthM", value: 7.2 },
      { key: "deckWidthM", value: 3 },
    ]);
    const joists = check.rows.find((r) => r.line.price_match_key === "deck-joists")!;
    expect(joists).toMatchObject({ changed: true, line: { quantity: 12 }, before: { quantity: 9 } });
  });

  it("an empty box is missing (nothing is sent)", () => {
    expect(checkSizes(deckQuote(), { deckLengthM: "", deckWidthM: "3" }).invalid).toEqual(["deckLengthM"]);
  });

  it("a size the calculator can't use carries the shared check's words, and no materials", () => {
    const check = checkSizes(deckQuote(), { deckLengthM: "2400", deckWidthM: "3" });
    expect(check.edited).toBe(true);
    expect(check.preview?.problem).toBe("That size looks wrong — Deck length 2400 m? Did you mean 2400 mm (2.4 m)?");
    expect(check.rows).toEqual([]);
  });

  it("nothing stored to recalculate from: no preview", () => {
    const data = { ...deckQuote(), takeoff_inputs: undefined };
    expect(checkSizes(data, { deckLengthM: "7.2", deckWidthM: "3" }).preview).toBeNull();
  });
});

describe("sizesErrorMessage", () => {
  it("the page's usual words for a lock, a missing quote or a failed write", () => {
    expect(sizesErrorMessage(QUOTE_LOCKED_MESSAGE)).toBe("This quote has been accepted, so its lines can't change now.");
    expect(sizesErrorMessage("Quote not found.")).toBe("We couldn't find this quote. Go back to your jobs and open it again.");
    for (const error of ["network", "Could not save the confirmation.", "Could not write line items."]) {
      expect(sizesErrorMessage(error)).toBe("That didn't save. Check your signal and try again.");
    }
  });

  it("the size check's own answer shows as it is", () => {
    const problem = "That size looks wrong — Deck length 48 m is more than 30 m. Check it and try again.";
    expect(sizesErrorMessage(problem)).toBe(problem);
  });
});

it("sizesSavedMessage: says whether the materials moved", () => {
  expect(sizesSavedMessage(false)).toBe("Sizes confirmed");
  expect(sizesSavedMessage(true)).toBe("Sizes saved. Materials updated.");
});
