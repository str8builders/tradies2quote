/**
 * The sizes read off a drawing, on the new job page. Pure: tested in node.
 *
 * A quote written from a photo of a plan can carry key sizes the send gate
 * holds back until the tradie confirms them (quote_data.dimension_confirmation).
 * The sizes sheet drafts, checks and previews them with the classic editor's
 * own form rules (lib/dimensionConfirmationForm) and saves them through the
 * classic confirmDimensions action; this module only decides what it says.
 */

import type { ConfirmAndRecalcResult, DimensionEdit } from "@/lib/dimensionConfirmation";
import {
  dimensionEdits,
  invalidDimensions,
  previewDimensionConfirmation,
  recalculatedQuantities,
  type DimensionDraft,
  type RecalculatedQuantity,
} from "@/lib/dimensionConfirmationForm";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import { formatQuantity } from "@/lib/quantity-display";
import type { ConfirmableDimension, DimensionConfirmation, QuoteData } from "@/lib/quote-types";
import { saveErrorMessage } from "./lines";

/**
 * The quote with the sizes the page holds. Once confirmed here they must go
 * out with every later save: a line saved before the refresh brings them back
 * would otherwise put them back to unconfirmed (the classic editor saves its
 * live copy for the same reason). Unchanged sizes keep the very same object.
 */
export function withSizes(data: QuoteData, sizes: DimensionConfirmation | null): QuoteData {
  return (data.dimension_confirmation ?? null) === sizes ? data : { ...data, dimension_confirmation: sizes };
}

const REASONS = new Map<string, string>([
  ["no_scale", "We couldn't find a scale on the drawing."],
  ["low_confidence", "The drawing was hard to read."],
  ["plan_text_disagree", "The drawing and the sizes written on it didn't agree."],
  ["large_quantity", "It's a big job, so a small mistake in a size costs a lot."],
]);

/** Why the sizes need a check, in plain words. A reason we have no words for is left out. */
export function sizeReasons(reasons: readonly string[] | null | undefined): string[] {
  return (reasons ?? []).flatMap((reason) => {
    const words = REASONS.get(reason);
    return words ? [words] : [];
  });
}

/** The tradie typed a different usable size (the test confirmAndRecalc makes). */
export function sizeChanged(size: ConfirmableDimension, typed: string | undefined): boolean {
  const value = Number(typed);
  return Number.isFinite(value) && value > 0 && Math.abs(value - size.value) > 1e-9;
}

/** Under a changed size: what the drawing said, so it's easy to put back. */
export function sizeHint(size: ConfirmableDimension, typed: string | undefined): string | undefined {
  return sizeChanged(size, typed) ? `Your drawing said ${formatQuantity(size.value)} ${size.unit}.` : undefined;
}

export interface SizesCheck {
  sizes: ConfirmableDimension[];
  /** What the save sends. */
  edits: DimensionEdit[];
  /** What saving would do; null when nothing is stored to work the materials out from. */
  preview: ConfirmAndRecalcResult | null;
  /** Keys of the sizes that aren't a number above 0 (nothing is sent). */
  invalid: string[];
  /** A size differs from the drawing's. */
  edited: boolean;
  /** The materials worked out again, once a size has changed. */
  rows: RecalculatedQuantity[];
}

/** The sheet's whole picture for what's typed, from the classic panel's rules. */
export function checkSizes(data: QuoteData, draft: DimensionDraft): SizesCheck {
  const confirmation = data.dimension_confirmation;
  const sizes = confirmation?.dimensions ?? [];
  const edits = dimensionEdits(confirmation, draft);
  const preview = previewDimensionConfirmation(data, edits);
  return {
    sizes,
    edits,
    preview,
    invalid: invalidDimensions(confirmation, draft).map((size) => size.key),
    edited: sizes.some((size) => sizeChanged(size, draft[size.key])),
    rows: preview?.changed ? recalculatedQuantities(preview, data.line_items) : [],
  };
}

/**
 * Plain words for a confirm that didn't save. The size check's own answer
 * ("That size looks wrong…") already says what to fix, so it shows as it is.
 */
export function sizesErrorMessage(error: string): string {
  if (error === QUOTE_LOCKED_MESSAGE || error === "Quote not found." || error === "network" || /^Could not /.test(error)) {
    return saveErrorMessage(error, QUOTE_LOCKED_MESSAGE);
  }
  return error;
}

/** The toast once the sizes are in. */
export function sizesSavedMessage(changed: boolean): string {
  return changed ? "Sizes saved. Materials updated." : "Sizes confirmed";
}
