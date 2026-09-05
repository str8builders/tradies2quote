import type { QuoteLineItem } from "./quote-types";

/**
 * Retires evidence that an editor action has superseded. Pure so every quote
 * editor path can share the same trust rule and regression tests can lock it.
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

  if (quantityChanged || descriptionChanged) {
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
    next.library_id = null;
    next.material_id = null;
    next.price_match_key = undefined;
    next.price_source = "missing_price";
    next.price_confidence = undefined;
    next.unit_price = 0;
    next.is_missing_price = true;
    next.t2qcal_basis_fingerprint = unitChanged
      ? undefined
      : next.t2qcal_basis_fingerprint;
  }

  return next;
}
