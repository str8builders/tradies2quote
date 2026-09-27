/**
 * What a photo or sketched plan read by the Photo / Plan agent
 * (/api/agents/photo-plan) adds to a quote. Pure and client-safe: the classic
 * editor's "Photo / plan" panel and the new job page's "Add from a plan
 * photo" sheet both write exactly this.
 *
 *   - Each item it spotted becomes a draft material line: 1 each, priced from
 *     the tradie's library only when the match is sold each (or converts to
 *     each exactly), marked as an AI guess whose quantity must be confirmed
 *     before sending (the send gate holds unconfirmed AI quantities).
 *   - The quote-note draft and the on-site review flags become quote notes,
 *     trimmed, blanks dropped.
 *
 * Both are APPENDED: a photo adds to the quote, it never replaces the lines
 * or notes already there (unlike a takeoff recalculation).
 */

import type { PhotoPlanItem, PhotoPlanResult } from "@/lib/agents/photo-plan";
import { matchToLibrary } from "@/lib/materials";
import { round2 } from "@/lib/quote-defaults";
import type { LibraryMaterial, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { convertUnitPrice } from "@/lib/units";

/** The review flag every line the agent spotted carries. */
export const PHOTO_PLAN_LINE_FLAG =
  "Photo/Plan agent spotted this item visually. Confirm the quantity before sending.";

/** One item the agent spotted, as a draft material line. */
export function photoPlanLine(item: PhotoPlanItem, library: LibraryMaterial[]): QuoteLineItem {
  const match = matchToLibrary(item.label, library);
  // Only a price per "each" (or an exact conversion) fits a 1 × each
  // line — a per-m or per-sheet library price stays unapplied.
  const unit_price =
    match && match.default_unit_price !== null
      ? (convertUnitPrice(Number(match.default_unit_price), match.unit, "each") ?? 0)
      : 0;
  return {
    type: "material",
    description: item.location ? `${item.label} — ${item.location}` : item.label,
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
    takeoff_flags: [PHOTO_PLAN_LINE_FLAG],
  };
}

/** The items the agent spotted, as draft material lines, in the order it listed them. */
export function photoPlanLines(items: readonly PhotoPlanItem[], library: LibraryMaterial[]): QuoteLineItem[] {
  return items.map((item) => photoPlanLine(item, library));
}

/** Quote notes as they are kept: trimmed, blank ones dropped. */
export function photoPlanNoteLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => line.length > 0);
}

export interface PhotoPlanNote {
  text: string;
  /** "note": the quote-note draft. "check": something to measure or check on site. */
  kind: "note" | "check";
}

/**
 * The notes a read offers, in the order they are added: the quote-note draft,
 * then each review flag. The texts are photoPlanNoteLines([quoteNote, ...reviewFlags]).
 */
export function photoPlanNotes(result: Pick<PhotoPlanResult, "quoteNote" | "reviewFlags">): PhotoPlanNote[] {
  return [
    ...photoPlanNoteLines([result.quoteNote]).map((text) => ({ text, kind: "note" as const })),
    ...photoPlanNoteLines(result.reviewFlags).map((text) => ({ text, kind: "check" as const })),
  ];
}

export type PhotoPlanPatch = Pick<QuoteData, "line_items" | "notes">;

/**
 * The quote's lines and notes with what the tradie picked added after the
 * ones already there. With every item and note picked, this is exactly what
 * the classic editor saves after "Add items" and "Add notes".
 */
export function photoPlanPatch(
  data: PhotoPlanPatch,
  picked: { items: readonly PhotoPlanItem[]; notes: readonly string[] },
  library: LibraryMaterial[],
): PhotoPlanPatch {
  return {
    line_items: [...data.line_items, ...photoPlanLines(picked.items, library)],
    notes: [...(Array.isArray(data.notes) ? data.notes : []), ...photoPlanNoteLines(picked.notes)],
  };
}
