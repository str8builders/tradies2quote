// ─────────────────────────────────────────────────────────────────────────
// Supplier estimate → quote (1:1).
//
// Turns the parsed line items of a supplier's materials estimate (e.g. an
// ITM order) into quote line items — ONE priced row per supplier line. This
// is NOT a takeoff: nothing is calculated from geometry, no trade modules
// run. The supplier's quantities are authoritative.
//
// Quantity rules:
//   - If the line shows a piece count ("19/4.8m" → pieces=19), use it as-is
//     (the supplier already did the stock-length maths — no waste re-applied).
//   - Else if the unit is lineal (m / lm / lineal / length), convert to whole
//     stock lengths: ceil(LM × (1 + waste) / stock).
//   - Else (each / pk / bx / bag / …), pass the count through unchanged.
//
// Prices come from the tradie's material library (the supplier's numbers are
// COST, not the tradie's sell price); unmatched lines are $0 + "needs price".
// ─────────────────────────────────────────────────────────────────────────

import {
  preciseUnitPrice,
  toExGst,
  unitPriceExGst,
  type ExtractedSupplierItem,
} from "./quoteExtraction";
import type {
  LibraryMaterial,
  QuoteLineItem,
  QuoteProfile,
} from "../quote-types";
import { matchToLibrary } from "../materials";
import {
  computeQuoteTotals as computeSharedQuoteTotals,
  round2,
} from "../quote-defaults";

const DEFAULT_STOCK_M = 6;
const DEFAULT_WASTE_PCT = 10;

// Units (already normalised by quoteExtraction) that mean "lineal metres".
const LINEAL_UNITS = new Set(["m", "lm", "lineal", "length", "lengths", "lin", "len"]);

export type EstimateToQuoteOptions = {
  library: LibraryMaterial[];
  stockLengthM?: number;
  wastePercent?: number;
  /**
   * Whether the supplier's printed prices INCLUDE GST (from the
   * extraction's `gst_inclusive`). Used to convert the supplier price to
   * the ex-GST basis quote lines store. Defaults to false (ex-GST).
   */
  gstInclusive?: boolean | null;
  /** GST fraction for the inclusive→ex-GST conversion. NZ = 0.15. */
  taxRate?: number;
};

/**
 * Resolve one supplier line's printed quantity into the order quantity + unit
 * that goes on the quote.
 */
export function resolveOrderQuantity(
  item: Pick<ExtractedSupplierItem, "unit" | "quantity" | "pieces">,
  stockLengthM: number,
  wastePercent: number,
): { quantity: number; unit: string } {
  // Supplier already broke it into pieces — authoritative, no re-rounding.
  if (item.pieces != null && item.pieces > 0) {
    return { quantity: item.pieces, unit: "lengths" };
  }
  const qty = item.quantity ?? 0;
  const unit = (item.unit || "each").trim();
  if (LINEAL_UNITS.has(unit.toLowerCase())) {
    const lengths = Math.max(
      1,
      Math.ceil((qty * (1 + wastePercent / 100)) / stockLengthM),
    );
    return { quantity: lengths, unit: "lengths" };
  }
  // each / pk / bx / bag / box / pair / kg / … → pass through, no waste.
  return { quantity: Math.max(0, qty), unit };
}

/**
 * Build one priced quote line per supplier estimate line. No takeoff, no
 * trade modules, no duplicates — the supplier list is the source of truth.
 */
export function buildQuoteLinesFromEstimate(
  items: ExtractedSupplierItem[],
  opts: EstimateToQuoteOptions,
): QuoteLineItem[] {
  const stock = opts.stockLengthM ?? DEFAULT_STOCK_M;
  const waste = opts.wastePercent ?? DEFAULT_WASTE_PCT;
  const gstInclusive = opts.gstInclusive ?? false;
  const taxRate = opts.taxRate ?? 0.15;

  const lines: QuoteLineItem[] = items
    .filter((it) => it.name.trim().length > 0)
    .map((it) => {
      const { quantity, unit } = resolveOrderQuantity(it, stock, waste);
      const match = matchToLibrary(it.name, opts.library);
      const libraryPrice =
        match && match.default_unit_price != null
          ? Number(match.default_unit_price)
          : null;

      // Price priority — so a quote built from an ITM/merchant estimate
      // carries ALL its numbers through instead of dropping to $0:
      //   1. The tradie's own library price (their established sell basis).
      //   2. The supplier's printed price off the quote, converted to
      //      ex-GST so the quote's markup + GST apply on the same basis as
      //      library prices.
      //   3. Nothing anywhere → $0 + "needs price".
      let unit_price = 0;
      let price_source: QuoteLineItem["price_source"] = "missing_price";
      if (libraryPrice != null) {
        unit_price = libraryPrice;
        price_source = "user_library";
      } else if (it.price != null && it.price > 0) {
        unit_price = toExGst(it.price, gstInclusive, taxRate);
        price_source = "supplier_import";
      }

      const line: QuoteLineItem = {
        type: "material",
        description: it.name.trim(),
        quantity,
        unit,
        unit_price,
        line_total: round2(quantity * unit_price),
        library_id: match?.id ?? null,
        is_ai_estimated: false,
        is_missing_price: unit_price === 0,
        is_calculated_takeoff: false,
        price_source,
      };
      return line;
    });

  addPileKitWarning(lines);
  return lines;
}

/**
 * Sanity check requested in the spec: a pile fixing kit count should not be
 * lower than the number of piles it fixes. Surfaces as a row-level badge.
 */
function addPileKitWarning(lines: QuoteLineItem[]): void {
  const kit = lines.find((l) =>
    /pile\s*fixing\s*kit|l\/?lok\s*pile/i.test(l.description),
  );
  const piles = lines.find(
    (l) =>
      /tanapile|anchor\s*pile|\bpiles?\b/i.test(l.description) &&
      !/kit/i.test(l.description),
  );
  if (kit && piles && kit.quantity < piles.quantity) {
    kit.warnings = [
      ...(kit.warnings ?? []),
      `Only ${kit.quantity} pile fixing kit(s) for ${piles.quantity} piles — likely an undercount.`,
    ];
  }
}

export type MirrorQuoteOptions = {
  /** Whether the scanned prices INCLUDE GST (from the extraction). */
  gstInclusive?: boolean | null;
  /** GST fraction for inclusive→ex-GST conversion. NZ = 0.15. */
  taxRate?: number;
};

/** A printed line total "agrees" with qty × price within this many dollars. */
const LINE_AGREEMENT_TOLERANCE = 0.02;

/**
 * The ex-GST unit price for one mirrored supplier line, at full precision.
 *
 * GST-inclusive quotes: when the printed line total agrees with qty × price,
 * the ex-GST figure is derived from the LINE TOTAL (total ÷ (1 + rate) ÷ qty)
 * so the quote's line total is exactly the printed line total ex-GST, rounded
 * once. Converting and rounding the unit price first is what produced
 * 10,000 × $0.05 → $460, 100 × $9.99 → $999.35 and 10 × $10 → $87.00 (vs the
 * supplier's $86.96). Exclusive quotes keep the printed price as-is.
 */
function mirrorUnitPriceExGst(
  price: number,
  quantity: number,
  printedLineTotal: number | null,
  gstInclusive: boolean,
  taxRate: number,
): number {
  if (price === 0) return 0;
  if (!gstInclusive) return preciseUnitPrice(price);
  if (
    printedLineTotal != null &&
    quantity > 0 &&
    Math.abs(round2(quantity * price) - printedLineTotal) <= LINE_AGREEMENT_TOLERANCE
  ) {
    return preciseUnitPrice(printedLineTotal / (1 + taxRate) / quantity);
  }
  return unitPriceExGst(price, true, taxRate);
}

/**
 * Faithful 1:1 mirror of a scanned supplier (ITM) quote → quote lines.
 *
 * Unlike `buildQuoteLinesFromEstimate`, this is a pure pass-through:
 *   - quantity is exactly as scanned (no waste, no stock-length rounding),
 *   - price is exactly as scanned (only converted to ex-GST so the quote's
 *     own GST line reconstructs the supplier total — never rounded to the
 *     cent, see `mirrorUnitPriceExGst`),
 *   - a printed discount / credit line stays a negative line,
 *   - no library substitution.
 * Combined with markup = 0 at the caller, the quote total equals the
 * supplier quote total — "nothing changes in the numbers".
 */
export function buildMirrorQuoteLines(
  items: ExtractedSupplierItem[],
  opts: MirrorQuoteOptions = {},
): QuoteLineItem[] {
  const gstInclusive = opts.gstInclusive ?? false;
  const taxRate = opts.taxRate ?? 0.15;

  return items
    .filter((it) => it.name.trim().length > 0)
    .map((it) => {
      // Quantity drives the line total; prefer the printed quantity (in the
      // unit the price is per), falling back to the piece count.
      const quantity = Math.max(0, it.quantity ?? it.pieces ?? 0);
      const rawPrice =
        it.price != null && Number.isFinite(it.price) ? it.price : 0;
      const unit_price = mirrorUnitPriceExGst(
        rawPrice,
        quantity,
        it.source_line_total,
        gstInclusive,
        taxRate,
      );
      const line: QuoteLineItem = {
        type: "material",
        description: it.name.trim(),
        quantity,
        unit: (it.unit || "each").trim(),
        unit_price,
        line_total: round2(quantity * unit_price),
        library_id: null,
        is_ai_estimated: false,
        is_missing_price: unit_price === 0,
        is_calculated_takeoff: false,
        price_source: unit_price !== 0 ? "supplier_import" : "missing_price",
        // Printed line total in the quote's ex-GST basis, kept as the
        // read-only supplier source for the Review Quote reconciliation.
        source_line_total:
          it.source_line_total != null
            ? toExGst(it.source_line_total, gstInclusive, taxRate)
            : null,
        // PHASE 2 — raw values EXACTLY as scanned (never GST-converted),
        // so Review Quote can diff source vs the normalized/computed line.
        source_description: it.name.trim(),
        source_quantity: it.quantity ?? it.pieces ?? null,
        source_unit: it.unit ? it.unit.trim() : null,
        source_unit_price: it.price ?? null,
      };
      return line;
    });
}

export type QuoteTotals = {
  materials_subtotal: number;
  labour_subtotal: number;
  markup_pct: number;
  markup_amount: number;
  subtotal_before_tax: number;
  tax_amount: number;
  total: number;
};

/**
 * Totals math. Thin profile-shaped wrapper over the single shared money
 * utility in quote-defaults (`computeQuoteTotals`) so there is exactly one
 * implementation of quote totals in the codebase — markup applies to
 * materials only, GST applies to the post-markup subtotal, sum-of-rounded
 * lines. Returns the same shape callers here already use (adds markup_pct).
 */
export function computeQuoteTotals(
  lineItems: QuoteLineItem[],
  profile: Pick<QuoteProfile, "default_markup_pct" | "tax_rate">,
): QuoteTotals {
  const totals = computeSharedQuoteTotals(
    lineItems,
    profile.default_markup_pct,
    profile.tax_rate,
  );
  return { ...totals, markup_pct: profile.default_markup_pct };
}
