import { describe, expect, it } from "vitest";
import type { PhotoPlanItem } from "@/lib/agents/photo-plan";
import { matchToLibrary } from "@/lib/materials";
import { round2 } from "@/lib/quote-defaults";
import type { LibraryMaterial, QuoteLineItem } from "@/lib/quote-types";
import { convertUnitPrice } from "@/lib/units";
import {
  PHOTO_PLAN_LINE_FLAG,
  photoPlanLine,
  photoPlanLines,
  photoPlanNoteLines,
  photoPlanNotes,
  photoPlanPatch,
} from "./photoPlanLines";

function material(patch: Partial<LibraryMaterial> & Pick<LibraryMaterial, "id" | "name">): LibraryMaterial {
  return {
    unit: null,
    default_unit_price: null,
    supplier: null,
    supplier_url: null,
    notes: null,
    usage_count: 0,
    is_ai_estimated: false,
    last_used_at: null,
    ...patch,
  };
}

const LIBRARY: LibraryMaterial[] = [
  material({ id: "lib-hanger", name: "Joist hanger", unit: "each", default_unit_price: 4.35 }),
  material({ id: "lib-pile", name: "Concrete pile", unit: "pcs", default_unit_price: 38.5 }),
  material({ id: "lib-timber", name: "H3.2 decking", unit: "m", default_unit_price: 6.2 }),
  material({ id: "lib-gib", name: "GIB board", unit: "sheet", default_unit_price: 29 }),
  material({ id: "lib-flashing", name: "Flashing tape", unit: null, default_unit_price: 18.999 }),
  material({ id: "lib-screws", name: "Deck screws", unit: "each", default_unit_price: null }),
];

function item(label: string, location: string | null = null): PhotoPlanItem {
  return { label, location, note: null, confidence: 0.7, ai_estimated: true };
}

const ITEMS: PhotoPlanItem[] = [
  item("Joist hanger", "under the bearer"),
  item("Concrete pile"),
  item("H3.2 decking boards", "top of the deck"),
  item("GIB board sheet (used)", "left wall, lower half"),
  item("Flashing tape", ""),
  item("Deck screws"),
  item("Something the library has never heard of", "back corner"),
];

/**
 * The classic editor's own code, word for word as it stood in QuoteEditor.tsx
 * (handlePhotoPlanItems / handlePhotoPlanNotes) before it moved here: the
 * oracle the shared lib must match exactly.
 */
function classicItems(detected: PhotoPlanItem[], library: LibraryMaterial[]): QuoteLineItem[] {
  return detected.map((d) => {
    const match = matchToLibrary(d.label, library);
    const unit_price =
      match && match.default_unit_price !== null
        ? (convertUnitPrice(Number(match.default_unit_price), match.unit, "each") ?? 0)
        : 0;
    return {
      type: "material",
      description: d.location ? `${d.label} — ${d.location}` : d.label,
      quantity: 1,
      unit: "each",
      unit_price,
      line_total: round2(unit_price),
      library_id: match?.id ?? null,
      is_ai_estimated: true,
      is_missing_price: unit_price <= 0,
      quantity_source: "ai",
      quantity_confirmed: false,
      takeoff_status: "assumed",
      takeoff_flags: [
        "Photo/Plan agent spotted this item visually. Confirm the quantity before sending.",
      ],
    };
  });
}
function classicNotes(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter((l) => l.length > 0);
}

describe("photoPlanLine: one spotted item as a draft material line", () => {
  it("goes in as 1 each with no price, an AI guess the tradie must confirm", () => {
    expect(photoPlanLine(item("Weatherboard (bevel-back)", "north wall"), [])).toEqual({
      type: "material",
      description: "Weatherboard (bevel-back) — north wall",
      quantity: 1,
      unit: "each",
      unit_price: 0,
      line_total: 0,
      library_id: null,
      is_ai_estimated: true,
      is_missing_price: true,
      quantity_source: "ai",
      quantity_confirmed: false,
      takeoff_status: "assumed",
      takeoff_flags: [PHOTO_PLAN_LINE_FLAG],
    });
  });

  it("names the place only when the agent gave one", () => {
    expect(photoPlanLine(item("Concrete pile"), []).description).toBe("Concrete pile");
    expect(photoPlanLine(item("Concrete pile", ""), []).description).toBe("Concrete pile");
  });

  it("takes the library price when it is sold each (or converts exactly to each)", () => {
    const hanger = photoPlanLine(item("Joist hanger"), LIBRARY);
    expect(hanger).toMatchObject({ unit_price: 4.35, line_total: 4.35, library_id: "lib-hanger", is_missing_price: false });
    // "pcs" is a count, the same as each.
    expect(photoPlanLine(item("Concrete pile"), LIBRARY)).toMatchObject({ unit_price: 38.5, library_id: "lib-pile" });
    // No unit on the library row: sold each.
    expect(photoPlanLine(item("Flashing tape"), LIBRARY)).toMatchObject({
      unit_price: 18.999,
      line_total: 19,
      library_id: "lib-flashing",
    });
  });

  it("keeps the link but leaves a per-metre, per-sheet or blank price unapplied", () => {
    for (const label of ["H3.2 decking boards", "GIB board sheet (used)", "Deck screws"]) {
      const line = photoPlanLine(item(label), LIBRARY);
      expect(line.unit_price, label).toBe(0);
      expect(line.line_total, label).toBe(0);
      expect(line.is_missing_price, label).toBe(true);
      expect(line.library_id, label).not.toBeNull();
    }
  });

  it("gives every line its own flag list", () => {
    const [a, b] = photoPlanLines([item("Concrete pile"), item("Joist hanger")], LIBRARY);
    expect(a.takeoff_flags).not.toBe(b.takeoff_flags);
  });
});

describe("photoPlanNoteLines / photoPlanNotes", () => {
  it("trims the notes and drops the blank ones", () => {
    expect(photoPlanNoteLines(["  Supply and fix as drawn. ", "", "   ", "\nMeasure on site\n"])).toEqual([
      "Supply and fix as drawn.",
      "Measure on site",
    ]);
  });

  it("offers the quote-note draft first, then each thing to check on site", () => {
    const result = { quoteNote: " Build the deck as drawn.\n", reviewFlags: ["No scale: measure on site.", " ", "Check the spans."] };
    expect(photoPlanNotes(result)).toEqual([
      { text: "Build the deck as drawn.", kind: "note" },
      { text: "No scale: measure on site.", kind: "check" },
      { text: "Check the spans.", kind: "check" },
    ]);
    expect(photoPlanNotes(result).map((n) => n.text)).toEqual(
      classicNotes([result.quoteNote, ...result.reviewFlags]),
    );
    expect(photoPlanNotes({ quoteNote: "  ", reviewFlags: [] })).toEqual([]);
  });
});

describe("photoPlanPatch: what the quote saves", () => {
  const existing: QuoteLineItem = {
    type: "labour",
    description: "Build the deck",
    quantity: 3,
    unit: "day",
    unit_price: 560,
    line_total: 1680,
  };
  const quote = { line_items: [existing], notes: ["Client supplies the stain."] };

  it("adds the picked lines and notes after the ones already there, and changes nothing else", () => {
    const patch = photoPlanPatch(quote, { items: [ITEMS[0]], notes: [" Check the spans. "] }, LIBRARY);
    expect(Object.keys(patch).sort()).toEqual(["line_items", "notes"]);
    expect(patch.line_items).toHaveLength(2);
    expect(patch.line_items[0]).toBe(existing);
    expect(patch.line_items[1]).toMatchObject({ description: "Joist hanger — under the bearer", unit_price: 4.35 });
    expect(patch.notes).toEqual(["Client supplies the stain.", "Check the spans."]);
    expect(quote).toEqual({ line_items: [existing], notes: ["Client supplies the stain."] });
  });

  it("with everything picked it is exactly what the classic editor saves", () => {
    const result = {
      quoteNote: "Supply and build as drawn.\nPiles to be confirmed on site.",
      reviewFlags: ["No scale on the drawing.", "", "  Possible asbestos in the old cladding.  "],
    };
    const patch = photoPlanPatch(
      quote,
      { items: ITEMS, notes: photoPlanNotes(result).map((n) => n.text) },
      LIBRARY,
    );
    expect(patch).toEqual({
      line_items: [...quote.line_items, ...classicItems(ITEMS, LIBRARY)],
      notes: [...quote.notes, ...classicNotes([result.quoteNote, ...result.reviewFlags])],
    });
    expect(photoPlanLines(ITEMS, LIBRARY)).toEqual(classicItems(ITEMS, LIBRARY));
    expect(photoPlanLines(ITEMS, [])).toEqual(classicItems(ITEMS, []));
  });

  it("nothing picked leaves the quote as it was", () => {
    expect(photoPlanPatch(quote, { items: [], notes: [" "] }, LIBRARY)).toEqual(quote);
  });

  it("a quote saved without notes starts a list", () => {
    const legacy = { line_items: [], notes: undefined as unknown as string[] };
    expect(photoPlanPatch(legacy, { items: [], notes: ["Measure on site."] }, [])).toEqual({
      line_items: [],
      notes: ["Measure on site."],
    });
  });
});
