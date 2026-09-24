import type { QuoteLineItem } from "@/lib/quote-types";
import { round2 } from "@/lib/quote-defaults";
import { preciseUnitPrice } from "@/lib/materials/quoteExtraction";

/** The library fields a scanned product needs to become a quote line. */
export type ScannedLibraryItem = {
  id: string;
  name: string;
  unit: string | null;
  default_unit_price: number | null;
};

/**
 * The quote line for a product scanned in the quote editor: one of it, in the
 * library item's unit, at the tradie's own library price (ex GST, like every
 * library price), linked to the library row. The editor appends it through
 * its normal add-line path, so totals, the $0 checks and saving treat it like
 * a line typed by hand. An item with no saved price becomes a missing-price
 * line for the tradie to fill in — never a silent $0.
 */
export function scannedMaterialLine(item: ScannedLibraryItem): QuoteLineItem {
  const price = Number(item.default_unit_price);
  const unit_price = Number.isFinite(price) && price > 0 ? preciseUnitPrice(price) : 0;
  const priced = unit_price > 0;
  return {
    type: "material",
    description: item.name.trim(),
    quantity: 1,
    unit: item.unit?.trim() || "each",
    unit_price,
    line_total: round2(unit_price),
    library_id: item.id,
    is_ai_estimated: false,
    is_missing_price: !priced,
    price_source: priced ? "user_library" : "missing_price",
    ...(priced ? { price_confidence: "high" as const } : {}),
  };
}
