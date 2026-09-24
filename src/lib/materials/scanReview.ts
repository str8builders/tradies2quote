// ─────────────────────────────────────────────────────────────────────────
// Supplier-scan review helpers (pure, client-safe). Maps the merged scan
// response onto the editable review rows and words the GST-basis note, so
// the mapping the review screen depends on is testable on its own.
// ─────────────────────────────────────────────────────────────────────────

import type { ScanPage } from "./mergeExtractions";

export type ScanReviewRow = {
  id: string;
  include: boolean;
  name: string;
  unit: string;
  quantity: string; // kept as string for the input; parsed on use
  price: string; // kept as string for the input; parsed on save
  sku: string | null;
  /** Printed line total as scanned — read-only SOURCE for reconciliation. */
  sourceLineTotal: number | null;
  /** A printed discount / credit line (negative). Goes on the quote, never the library. */
  credit: boolean;
  lowConfidence: boolean;
  /** Exactly what the scanner read for this row — provenance for spot-checks. */
  rawText: string | null;
};

/** Below this the row is flagged for a 2-second eyeball against the photo. */
export const LOW_CONFIDENCE = 0.8;

export function buildReviewRows(
  items: ScanPage["items"],
  newId: () => string,
): ScanReviewRow[] {
  return items.map((it) => {
    const credit =
      (it.price != null && it.price < 0) ||
      (it.source_line_total != null && it.source_line_total < 0);
    return {
      id: newId(),
      // A $0 / unpriced row starts unticked; a discount is a real line.
      include: it.price !== null && it.price !== 0,
      name: it.name,
      unit: it.unit,
      quantity:
        it.quantity != null
          ? String(it.quantity)
          : it.pieces != null
            ? String(it.pieces)
            : "",
      price: it.price !== null ? String(it.price) : "",
      sku: it.sku,
      // The extract route returns the printed total as `source_line_total`.
      sourceLineTotal: it.source_line_total ?? null,
      credit,
      lowConfidence: it.confidence < LOW_CONFIDENCE,
      rawText: it.raw_text ?? null,
    };
  });
}

/**
 * The note shown on the review screen when the scan could not tell whether
 * the printed prices include GST. Null when the scan read it (the checkbox
 * already shows the read value).
 */
export function gstBasisNote(
  detected: boolean | null,
  inclusive: boolean,
): string | null {
  if (detected !== null) return null;
  return inclusive
    ? "The scan couldn’t tell whether these prices include GST. You’ve set them as including GST, so they’re converted to ex-GST when saved."
    : "The scan couldn’t tell whether these prices include GST, so they’re treated as excluding GST. Tick “Prices include GST” if the quote shows GST-inclusive prices.";
}
