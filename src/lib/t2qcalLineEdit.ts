import type { QuoteLineItem } from "./quote-types";

/**
 * Retires evidence that an editor action has superseded. Pure so every quote
 * editor path can share the same trust rule and regression tests can lock it.
 *
 * Price rule: a price is only reset when it can no longer be right — the
 * selling UNIT changed (a per-hour or per-sheet price means nothing per day
 * or per m²), or a CALCULATOR-sourced line was renamed (its library/package
 * basis belonged to the old product). Renaming any other line keeps its
 * price: fixing a typo on "10 h × $75" must never quietly quote $0.
 *
 * Typing a unit price is the tradie pricing the line themselves, so it
 * clears the missing-price flag (and the stale "missing_price" source).
 */
export function applyLineEdit(
  item: QuoteLineItem,
  patch: Partial<QuoteLineItem>,
): QuoteLineItem {
  const next: QuoteLineItem = { ...item, ...patch };
  const quantityChanged = patch.quantity !== undefined
    && Number(patch.quantity) !== Number(item.quantity);
  const descriptionChanged = patch.description !== undefined
    && patch.description !== item.description;
  const unitChanged = patch.unit !== undefined && patch.unit !== item.unit;
  // Judged on the line BEFORE this edit — the block below clears these.
  const calculatorSourced = item.is_calculated_takeoff === true
    || item.quantity_source === "calculator";

  if (quantityChanged || descriptionChanged || unitChanged) {
    next.quantity_source = "user";
    next.quantity_confirmed = true;
    next.is_calculated_takeoff = false;
    next.formula = undefined;
    next.t2qcal_assumptions = undefined;
    next.t2qcal_checks = undefined;
    next.t2qcal_calculator_snapshot = undefined;
    next.t2qcal_provenance_note = "T2QCAL result edited and confirmed by the user.";
  }

  if (descriptionChanged || unitChanged) {
    next.t2qcal_basis_fingerprint = undefined;
  }

  const resetPrice = unitChanged || (descriptionChanged && calculatorSourced);
  if (resetPrice) {
    next.library_id = null;
    next.material_id = null;
    next.price_match_key = undefined;
    next.price_source = "missing_price";
    next.price_confidence = undefined;
    next.unit_price = 0;
    next.is_missing_price = true;
  }

  if (patch.unit_price !== undefined) {
    // A price typed in the same edit always wins over the reset above.
    next.unit_price = patch.unit_price;
    const priced = (Number(patch.unit_price) || 0) > 0;
    if (patch.is_missing_price === undefined) next.is_missing_price = !priced;
    if (priced && next.price_source === "missing_price") {
      next.price_source = undefined;
      next.price_confidence = undefined;
    }
  }

  return next;
}
