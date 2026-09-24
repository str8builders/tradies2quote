// ─────────────────────────────────────────────────────────────────────────
// Suggest-a-Price agent — apply-side pure helpers (Chunk B).
//
// Tiny, deterministic helpers shared by the editor UI + the save-to-library
// server action. No I/O. They decide WHEN the per-line button shows and
// validate a material before it can be saved — so no junk (no name, $0/NaN
// price) ever reaches the library, and the button never appears on a priced
// or non-material line.
// ─────────────────────────────────────────────────────────────────────────

import type { QuoteLineItem } from "../../quote-types";
import { round2 } from "../../quote-defaults";

/** Whether the on-demand "Suggest price" control should show for this line. */
export function canSuggestPrice(item: QuoteLineItem, enabled: boolean): boolean {
  if (!enabled) return false;
  if (item.type !== "material") return false;
  if ((Number(item.quantity) || 0) <= 0) return false;
  return item.is_missing_price === true || (Number(item.unit_price) || 0) <= 0;
}

/**
 * Validate + normalise a material the tradie chose to save to their library.
 * Returns null for anything unsafe (no name, non-positive / non-finite
 * price) so the save action can never persist junk.
 */
export function normalizeSuggestedMaterial(input: {
  name?: unknown;
  unit?: unknown;
  price?: unknown;
}): { name: string; unit: string; default_unit_price: number } | null {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return null;
  const price =
    typeof input.price === "number" ? input.price : Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const unit =
    typeof input.unit === "string" && input.unit.trim()
      ? input.unit.trim()
      : "each";
  return { name, unit, default_unit_price: round2(price) };
}
