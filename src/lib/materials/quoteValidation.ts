// ─────────────────────────────────────────────────────────────────────────
// Supplier-quote validation — the deterministic reconciliation layer.
//
// Takes the AI's extraction (which only ever *reads* numbers off the quote)
// and checks the printed SOURCE values against figures we recompute
// ourselves: line_total = qty × unit price, subtotal = Σ line_totals,
// total = subtotal + GST. Every disagreement is surfaced as a typed flag
// with a plain-English reason and a severity. The AI never decides whether
// the numbers are right — this code does, deterministically.
//
// `blocking` is true when any check is an error; callers use it to stop a
// quote being auto-approved/created until the tradie acknowledges or fixes
// the mismatch.
// ─────────────────────────────────────────────────────────────────────────

import { round2 } from "../quote-defaults";
import type { SupplierQuoteExtraction } from "./quoteExtraction";

export type Severity = "ok" | "warning" | "error";

/** Deterministic reconciliation verdict the send gate consumes. */
export type ReconciliationStatus = "ok" | "needs_review" | "blocked";

/** Map a worst-case severity to the send-gate reconciliation status. */
export function reconciliationStatusFromSeverity(
  s: Severity,
): ReconciliationStatus {
  return s === "error" ? "blocked" : s === "warning" ? "needs_review" : "ok";
}

/** One reconciliation check: what we recomputed (`expected`) vs what the
 *  quote printed (`found`). */
export type ValidationCheck = {
  field: "line_total" | "subtotal" | "gst" | "total";
  expected: number | null;
  found: number | null;
  delta: number | null;
  severity: Severity;
  reason: string;
};

export type LineValidation = {
  index: number;
  name: string;
  severity: Severity;
  checks: ValidationCheck[];
};

export type QuoteValidationReport = {
  lines: LineValidation[];
  summary: ValidationCheck[];
  severity: Severity;
  /** True when any check is an error — block auto-approval until resolved. */
  blocking: boolean;
  /** Send-gate verdict: ok | needs_review | blocked (derived from severity). */
  reconciliation_status: ReconciliationStatus;
  /** Plain-English reasons for every non-ok check (line + summary). */
  reconciliation_reasons: string[];
  /** Figures recomputed deterministically, for the UI's "app value" column. */
  recomputed: {
    lineTotals: Array<number | null>;
    subtotal: number;
    gst: number;
    total: number;
  };
};

export type ValidateOptions = {
  /** GST fraction. NZ = 0.15. */
  taxRate?: number;
  /** Money tolerance in dollars before a difference is flagged. */
  tolerance?: number;
};

const DEFAULT_TAX_RATE = 0.15;
const DEFAULT_TOLERANCE = 0.02;

const RANK: Record<Severity, number> = { ok: 0, warning: 1, error: 2 };

function worst(a: Severity, b: Severity): Severity {
  return RANK[a] >= RANK[b] ? a : b;
}

function worstOf(severities: Severity[]): Severity {
  return severities.reduce<Severity>((acc, s) => worst(acc, s), "ok");
}

/**
 * Reconcile an extracted supplier quote against deterministically recomputed
 * figures. Pure — no I/O, safe to call on the server before persisting.
 */
export function validateSupplierQuote(
  extraction: SupplierQuoteExtraction,
  options: ValidateOptions = {},
): QuoteValidationReport {
  const taxRate = options.taxRate ?? DEFAULT_TAX_RATE;
  const tol = options.tolerance ?? DEFAULT_TOLERANCE;

  const lineTotals: Array<number | null> = [];
  const lines: LineValidation[] = extraction.items.map((item, index) => {
    const hasInputs = item.price != null && item.quantity != null;
    const recomputed = hasInputs
      ? round2((item.price as number) * (item.quantity as number))
      : null;
    lineTotals.push(recomputed);

    const checks: ValidationCheck[] = [];
    if (!hasInputs) {
      checks.push({
        field: "line_total",
        expected: null,
        found: item.source_line_total,
        delta: null,
        severity: "warning",
        reason:
          "Missing quantity or unit price — can't verify this line's total.",
      });
    } else if (item.source_line_total == null) {
      checks.push({
        field: "line_total",
        expected: recomputed,
        found: null,
        delta: null,
        severity: "ok",
        reason: "No printed line total on the quote to cross-check.",
      });
    } else {
      const delta = round2(item.source_line_total - (recomputed as number));
      const mismatch = Math.abs(delta) > tol;
      checks.push({
        field: "line_total",
        expected: recomputed,
        found: item.source_line_total,
        delta,
        severity: mismatch ? "error" : "ok",
        reason: mismatch
          ? `Printed line total (${item.source_line_total}) ≠ qty × unit price (${recomputed}).`
          : "Line total matches qty × unit price.",
      });
    }

    return {
      index,
      name: item.name,
      severity: worstOf(checks.map((c) => c.severity)),
      checks,
    };
  });

  // Subtotal: Σ of the recomputed line totals (lines we couldn't recompute
  // contribute 0 and are already flagged at line level).
  const recomputedSubtotal = round2(
    lineTotals.reduce<number>((sum, lt) => sum + (lt ?? 0), 0),
  );
  const inclusive = extraction.gst_inclusive === true;
  const discount = extraction.discount ?? 0;
  const freight = extraction.freight ?? 0;
  const adjustments = extraction.adjustments ?? 0;
  const baseSubtotal = extraction.subtotal ?? recomputedSubtotal;
  // Net of document-level discount/freight/adjustments. GST applies to the
  // net, and grand total = net + GST. When none are present this equals the
  // bare subtotal — backward-compatible with the prior behaviour.
  const baseNet = round2(baseSubtotal - discount + freight + adjustments);
  const recomputedGst = inclusive
    ? round2(baseNet - baseNet / (1 + taxRate))
    : round2(baseNet * taxRate);
  const recomputedTotal = inclusive
    ? round2(baseNet)
    : round2(baseNet + (extraction.gst ?? recomputedGst));

  // How the expected total was built, in the words the reasons use.
  const totalFormula = [
    "subtotal",
    discount ? "− discount" : "",
    freight ? "+ freight" : "",
    adjustments ? "+ adjustments" : "",
    "+ GST",
  ]
    .filter(Boolean)
    .join(" ");

  const summary: ValidationCheck[] = [];

  // Subtotal check (structural — strong signal of a missed/extra line).
  if (extraction.subtotal == null) {
    summary.push({
      field: "subtotal",
      expected: recomputedSubtotal,
      found: null,
      delta: null,
      severity: "warning",
      reason: "No printed subtotal to cross-check.",
    });
  } else {
    const delta = round2(extraction.subtotal - recomputedSubtotal);
    const mismatch = Math.abs(delta) > tol;
    summary.push({
      field: "subtotal",
      expected: recomputedSubtotal,
      found: extraction.subtotal,
      delta,
      severity: mismatch ? "error" : "ok",
      reason: mismatch
        ? `Printed subtotal (${extraction.subtotal}) ≠ sum of line totals (${recomputedSubtotal}).`
        : "Subtotal matches the sum of line totals.",
    });
  }

  // GST check (warning-level: incl/excl ambiguity + rounding can shift a cent).
  if (extraction.gst == null) {
    summary.push({
      field: "gst",
      expected: recomputedGst,
      found: null,
      delta: null,
      severity: "warning",
      reason: "No printed GST to cross-check.",
    });
  } else {
    const delta = round2(extraction.gst - recomputedGst);
    const mismatch = Math.abs(delta) > tol;
    summary.push({
      field: "gst",
      expected: recomputedGst,
      found: extraction.gst,
      delta,
      severity: mismatch ? "warning" : "ok",
      reason: mismatch
        ? `Printed GST (${extraction.gst}) ≠ ${(taxRate * 100).toFixed(0)}% of the subtotal (${recomputedGst}).`
        : "GST matches the subtotal.",
    });
  }

  // Total check (structural — must equal subtotal + GST).
  if (extraction.total == null) {
    summary.push({
      field: "total",
      expected: recomputedTotal,
      found: null,
      delta: null,
      severity: "warning",
      reason: "No printed total to cross-check.",
    });
  } else {
    const delta = round2(extraction.total - recomputedTotal);
    const mismatch = Math.abs(delta) > tol;
    summary.push({
      field: "total",
      expected: recomputedTotal,
      found: extraction.total,
      delta,
      severity: mismatch ? "error" : "ok",
      reason: mismatch
        ? `Printed total (${extraction.total}) ≠ ${totalFormula} (${recomputedTotal}).`
        : `Total matches ${totalFormula}.`,
    });
  }

  const severity = worstOf([
    ...lines.map((l) => l.severity),
    ...summary.map((c) => c.severity),
  ]);

  const reconciliation_reasons = [
    ...lines.flatMap((l) => l.checks),
    ...summary,
  ]
    .filter((c) => c.severity !== "ok")
    .map((c) => c.reason);

  return {
    lines,
    summary,
    severity,
    blocking: severity === "error",
    reconciliation_status: reconciliationStatusFromSeverity(severity),
    reconciliation_reasons,
    recomputed: {
      lineTotals,
      subtotal: recomputedSubtotal,
      gst: recomputedGst,
      total: recomputedTotal,
    },
  };
}
