// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — turn the materials list into quote lines (pure).
//
// Same contract as every calculator line in the app (takeoffLines.ts):
// a price only comes from the tradie's own library on an exact, unit-
// compatible match (libraryPriceForLine); otherwise the line is $0 and
// marked missing a price, so the quote can't go out with a guess in it.
// ─────────────────────────────────────────────────────────────────────────

import { libraryPriceForLine } from "@/lib/materials";
import { round2 } from "@/lib/quote-defaults";
import { computeQuoteTotals } from "@/lib/materials/estimateToQuote";
import type { LibraryMaterial, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import type { PlanTakeoff, PlanTakeoffLine } from "./fromModel";

export function planQuoteLine(line: PlanTakeoffLine, library: LibraryMaterial[]): QuoteLineItem {
  const priced = libraryPriceForLine({ description: line.name, unit: line.unit }, library);
  const unitPrice = priced?.unitPrice ?? null;
  return {
    type: "material",
    description: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unit_price: unitPrice ?? 0,
    line_total: unitPrice != null ? round2(unitPrice * line.quantity) : 0,
    library_id: priced?.match.item.id ?? null,
    is_ai_estimated: false,
    is_missing_price: unitPrice == null,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    formula: line.notes ? `${line.formula} ${line.notes}` : line.formula,
    price_match_key: line.priceMatchKey,
    takeoff_status: line.status,
  };
}

export function planQuoteLines(t: PlanTakeoff, library: LibraryMaterial[]): QuoteLineItem[] {
  return t.lines.map((l) => planQuoteLine(l, library));
}

export type QuoteProfileBits = { currency: string; taxLabel: string; taxRate: number; markupPct: number };

/** A new draft quote holding the plan-set materials. */
export function planSetQuoteData(t: PlanTakeoff, library: LibraryMaterial[], profile: QuoteProfileBits, summary: string): QuoteData {
  const lines = planQuoteLines(t, library);
  const totals = computeQuoteTotals(lines, { default_markup_pct: profile.markupPct, tax_rate: profile.taxRate });
  const notes = [
    ...t.assumptions.map((a) => `Assumed: ${a}`),
    ...(t.byOthers.length ? [`Not included (by others on the plans): ${t.byOthers.join("; ")}.`] : []),
  ];
  return {
    client: { name: "To be confirmed", address: null, email: null, phone: null, contact: null },
    job_summary: summary,
    line_items: lines,
    materials_subtotal: totals.materials_subtotal,
    labour_subtotal: totals.labour_subtotal,
    markup_pct: profile.markupPct,
    markup_amount: totals.markup_amount,
    subtotal_before_tax: totals.subtotal_before_tax,
    tax_amount: totals.tax_amount,
    total: totals.total,
    currency: profile.currency,
    tax_label: profile.taxLabel,
    tax_rate: profile.taxRate,
    terms: "",
    notes,
  };
}
