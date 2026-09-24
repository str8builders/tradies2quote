// ─────────────────────────────────────────────────────────────────────────
// Scan → quote (pure). The deterministic core of `createQuoteFromScan`:
// reviewed supplier-scan lines in, reconciliation report + a draft quote
// that mirrors the supplier quote out. No I/O, so the money rules can be
// tested against the same send gate the quote will later meet.
//
// Money rules:
//   - unit prices keep full precision (never rounded to the cent);
//   - a printed discount / credit line keeps its negative sign;
//   - reconciliation runs on the RAW printed values, GST-aware (incl price ×
//     qty against the incl printed line total — like with like);
//   - the quote itself is ex-GST, with every ex-GST line derived from its
//     printed line total (see buildMirrorQuoteLines).
// ─────────────────────────────────────────────────────────────────────────

import { round2 } from "../quote-defaults";
import type { QuoteData, QuoteLineItem, SupplierSource } from "../quote-types";
import { buildMirrorQuoteLines, computeQuoteTotals } from "./estimateToQuote";
import {
  preciseUnitPrice,
  toExGst,
  type ExtractedSupplierItem,
  type SupplierQuoteExtraction,
} from "./quoteExtraction";
import {
  validateSupplierQuote,
  type QuoteValidationReport,
} from "./quoteValidation";

export type ScanQuoteLine = {
  name: string;
  unit: string;
  quantity: number;
  /** Unit price as reviewed (negative for a discount / credit line). */
  price: number;
  /** Printed line total as scanned — carried through for reconciliation. */
  line_total?: number | null;
};

export type ScanQuoteMeta = {
  supplier: string | null;
  gstInclusive: boolean;
  /** Printed document totals as scanned (read-only source) for reconciliation. */
  subtotal?: number | null;
  gst?: number | null;
  total?: number | null;
  /** #2 — strict-extraction verdict from the scan route (provenance). */
  extractionStatus?: "ok" | "needs_review" | "blocked";
  extractionReasons?: string[];
  /** Ops — rows the strict parser rejected (persisted for the review queue). */
  rowFailures?: Array<{ index: number; reason: string; raw_text: string | null }>;
  /** Ops — how many AI passes ran (1 = no retry). For the retry-rate metric. */
  extractionAttempts?: number;
};

export type ScanQuoteProfile = {
  currency: string;
  taxLabel: string;
  /** Tax rate as a PERCENTAGE (15 = 15 %), as stored on the profile. */
  taxRate: number;
};

export type BuiltScanQuote = {
  items: ExtractedSupplierItem[];
  validation: QuoteValidationReport;
  lineItems: QuoteLineItem[];
  quoteData: QuoteData;
};

const finite = (v: unknown): number | null => {
  const n = Number(v);
  return v != null && v !== "" && Number.isFinite(n) ? n : null;
};

/** Reviewed scan lines → the extractor's item shape (no rounding, signs kept). */
export function scanLinesToItems(lines: ScanQuoteLine[]): ExtractedSupplierItem[] {
  return lines
    .map((l): ExtractedSupplierItem => {
      const price = finite(l.price);
      const quantity = finite(l.quantity);
      const lineTotal = finite(l.line_total);
      return {
        name: typeof l.name === "string" ? l.name.trim() : "",
        unit: typeof l.unit === "string" && l.unit.trim() ? l.unit.trim() : "each",
        price: price != null && price !== 0 ? preciseUnitPrice(price) : null,
        sku: null,
        quantity: quantity != null && quantity > 0 ? quantity : null,
        pieces: null,
        source_line_total: lineTotal != null ? round2(lineTotal) : null,
        raw_text: null,
        confidence: 1,
      };
    })
    .filter((i) => i.name.length > 0);
}

/**
 * The supplier subtotal on the quote's own ex-GST basis.
 *
 * Exclusive quotes: the printed subtotal as-is. Inclusive quotes: when the
 * printed subtotal reconciles with the printed lines (checked above on the
 * raw incl figures), it is expressed as the sum of the mirrored lines' ex-GST
 * values — each line's printed total ÷ (1 + rate), or its live total when the
 * supplier printed none — which is exactly what the send gate adds up. So
 * per-line cent rounding can't read as a missing line (six $10 incl lines are
 * 6 × $8.70 = $52.20 on the quote, while $60 ÷ 1.15 rounds to $52.17). When it
 * doesn't reconcile, the printed figure is converted directly so the gap stays
 * visible and blocks.
 */
function exGstSupplierSubtotal(
  meta: ScanQuoteMeta,
  validation: QuoteValidationReport,
  lineItems: QuoteLineItem[],
  taxRateFraction: number,
): number | null {
  if (meta.subtotal == null) return null;
  if (!meta.gstInclusive) return meta.subtotal;
  const subtotalCheck = validation.summary.find((c) => c.field === "subtotal");
  if (subtotalCheck?.severity === "ok") {
    return round2(
      lineItems.reduce((sum, l) => sum + (l.source_line_total ?? l.line_total), 0),
    );
  }
  return toExGst(meta.subtotal, true, taxRateFraction);
}

export function buildScanQuote(
  lines: ScanQuoteLine[],
  meta: ScanQuoteMeta,
  profile: ScanQuoteProfile,
): { ok: true; value: BuiltScanQuote } | { ok: false; error: string } {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, error: "No lines to turn into a quote." };
  }
  const items = scanLinesToItems(lines);
  if (items.length === 0) {
    return { ok: false, error: "No valid lines to turn into a quote." };
  }
  const taxRateFraction = profile.taxRate / 100;

  // Deterministic reconciliation on the RAW printed values (GST-aware).
  const extraction: SupplierQuoteExtraction = {
    supplier: meta.supplier ?? null,
    quote_number: null,
    currency: profile.currency,
    gst_inclusive: meta.gstInclusive ?? false,
    items,
    subtotal: meta.subtotal ?? null,
    gst: meta.gst ?? null,
    total: meta.total ?? null,
    notes: [],
  };
  const validation = validateSupplierQuote(extraction, { taxRate: taxRateFraction });

  const lineItems = buildMirrorQuoteLines(items, {
    gstInclusive: meta.gstInclusive ?? false,
    taxRate: taxRateFraction,
  });
  // markup 0 — a faithful mirror; total equals the supplier quote total.
  const totals = computeQuoteTotals(lineItems, {
    default_markup_pct: 0,
    tax_rate: profile.taxRate,
  });

  const supplierName =
    typeof meta.supplier === "string" && meta.supplier.trim()
      ? meta.supplier.trim()
      : null;

  const supplier_source: SupplierSource = {
    supplier: supplierName,
    subtotal: exGstSupplierSubtotal(meta, validation, lineItems, taxRateFraction),
    gst: meta.gst ?? null,
    total: meta.total ?? null,
    // PHASE 2 — raw printed document totals, EXACTLY as scanned and never
    // GST-converted, so the source can never be silently overwritten and
    // Review Quote can diff source vs computed.
    gst_inclusive: meta.gstInclusive ?? false,
    source_subtotal: meta.subtotal ?? null,
    source_gst: meta.gst ?? null,
    source_total: meta.total ?? null,
    source_discount: null,
    source_freight: null,
    source_adjustments: null,
    // Deterministic reconciliation verdict (computed on the RAW extraction,
    // GST-aware), frozen onto the quote so the pre-send gate can hard-block
    // a critical mismatch.
    reconciliation_status: validation.reconciliation_status,
    reconciliation_reasons: validation.reconciliation_reasons,
    // #2 — strict-extraction verdict (scan-time provenance for the trace).
    extraction_status: meta.extractionStatus,
    extraction_reasons: meta.extractionReasons,
    // Ops — rejected rows + attempt count, persisted so the owner
    // extraction-review queue + metrics can read them without re-scanning.
    row_failures: meta.rowFailures ?? [],
    extraction_attempts: meta.extractionAttempts ?? 1,
  };

  const quoteData: QuoteData = {
    client: { name: "To be confirmed", address: null, email: null, phone: null, contact: null },
    job_summary: supplierName
      ? `Imported from ${supplierName} supplier quote`
      : "Imported from supplier quote",
    line_items: lineItems,
    materials_subtotal: totals.materials_subtotal,
    labour_subtotal: totals.labour_subtotal,
    markup_pct: 0,
    markup_amount: totals.markup_amount,
    subtotal_before_tax: totals.subtotal_before_tax,
    tax_amount: totals.tax_amount,
    total: totals.total,
    currency: profile.currency,
    tax_label: profile.taxLabel,
    tax_rate: profile.taxRate,
    terms: "",
    notes: [],
    supplier_source,
  };

  return { ok: true, value: { items, validation, lineItems, quoteData } };
}
