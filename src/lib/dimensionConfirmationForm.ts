// ─────────────────────────────────────────────────────────────────────────
// #1 — The key-dimension confirmation form, shared by the classic editor's
// "confirm key dimensions" panel and the new job page's sizes sheet, so both
// check, preview and send exactly the same thing.
//
// The recalculation itself is confirmAndRecalc (dimensionConfirmation.ts):
// the preview here runs it before anyone is recorded as confirming, and the
// confirmDimensions server action runs it again, authoritatively, on the
// same quote data and edits. Pure, no I/O.
// ─────────────────────────────────────────────────────────────────────────

import {
  confirmAndRecalc,
  type ConfirmAndRecalcResult,
  type DimensionEdit,
} from "./dimensionConfirmation";
import type {
  ConfirmableDimension,
  DimensionConfirmation,
  QuoteData,
  QuoteLineItem,
} from "./quote-types";

/** The sizes as typed, by dimension key ("4.8"). */
export type DimensionDraft = Record<string, string>;

/** The form as it opens, and again after a save: every size as stored. */
export function dimensionDraft(
  dc: DimensionConfirmation | null | undefined,
): DimensionDraft {
  return Object.fromEntries(
    (dc?.dimensions ?? []).map((d) => [d.key, String(d.value)]),
  );
}

/** The edits confirmDimensions receives: every size, as typed. */
export function dimensionEdits(
  dc: DimensionConfirmation | null | undefined,
  draft: DimensionDraft,
): DimensionEdit[] {
  return (dc?.dimensions ?? []).map((d) => ({
    key: d.key,
    value: Number(draft[d.key]),
  }));
}

/**
 * Sizes that aren't a positive number, in the order shown. Nothing is sent
 * while there are any (confirmAndRecalc would quietly keep the stored value).
 */
export function invalidDimensions(
  dc: DimensionConfirmation | null | undefined,
  draft: DimensionDraft,
): ConfirmableDimension[] {
  return (dc?.dimensions ?? []).filter((d) => {
    const v = Number(draft[d.key]);
    return !Number.isFinite(v) || v <= 0;
  });
}

/**
 * What confirming these edits would do: the SAME pure recompute the server
 * runs on confirm, shown before the tap. Null when the quote has no sizes or
 * no stored takeoff inputs to recalculate from.
 */
export function previewDimensionConfirmation(
  data: QuoteData,
  edits: DimensionEdit[],
): ConfirmAndRecalcResult | null {
  return confirmAndRecalc(data, edits, { confirmedBy: "", confirmedAt: "" });
}

export type RecalculatedQuantity = {
  /** A calculator line as confirming would leave it. */
  line: QuoteLineItem;
  /** The calculator line it replaces (same price key, else description). */
  before: QuoteLineItem | null;
  /** A corrected size moves this line's quantity. */
  changed: boolean;
};

/**
 * The calculator lines a preview leaves, each beside the line it replaces in
 * `lines`, so the old quantity can show next to the new one.
 */
export function recalculatedQuantities(
  preview: ConfirmAndRecalcResult,
  lines: readonly QuoteLineItem[],
): RecalculatedQuantity[] {
  return preview.line_items
    .filter((i) => i.is_calculated_takeoff)
    .map((i) => {
      const before =
        lines.find(
          (x) =>
            x.is_calculated_takeoff &&
            (x.price_match_key ?? x.description) ===
              (i.price_match_key ?? i.description),
        ) ?? null;
      const changed =
        preview.changed &&
        before != null &&
        Math.abs((before.quantity ?? 0) - i.quantity) > 1e-9;
      return { line: i, before, changed };
    });
}
