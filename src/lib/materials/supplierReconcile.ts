// ─────────────────────────────────────────────────────────────────────────
// Supplier reconciliation — does a quote made from a scanned supplier quote
// still match it? Pure; tested in node against the send gate itself.
//
// Two views of the question, kept side by side so they can't drift apart:
//
//   1. The classic editor's "supplier reconciliation" panel, moved here
//      unchanged: the import screen's validator run over the live lines,
//      the lines it flags, and the "use supplier value" snap
//      (supplierReconciliation, reconciliationMismatches, supplierSnapPrice).
//   2. The send gate's supplier checks (quote-validation.ts, "PHASE 4 —
//      supplier-import source fidelity", a HARD block with no override), for
//      the new job page (supplierMismatches, supplierCheck). They use the
//      gate's own arithmetic, so a quote they call fixed is one the gate
//      lets through and a quote they flag is one it blocks.
//
// Where the two differ, the gate decides what can be sent. The classic panel
// adds EVERY line into its subtotal (the tradie's own labour too), compares
// the supplier's printed total with their own subtotal + GST, rounds each
// difference to the cent before the 2c tolerance, and only warns about a
// line with no price or no quantity. The gate checks only the supplier's
// lines: each one's live total against its printed total, and their sum
// (at the printed totals) against the printed subtotal.
// ─────────────────────────────────────────────────────────────────────────

import { round2 } from "../quote-defaults";
import type { QuoteData, QuoteLineItem, SupplierSource } from "../quote-types";
import { applyLineEdit } from "../t2qcalLineEdit";
import { preciseUnitPrice } from "./quoteExtraction";
import {
  validateSupplierQuote,
  type QuoteValidationReport,
  type ValidationCheck,
} from "./quoteValidation";

/* ── 1. The classic editor's panel ─────────────────────────────────────── */

/**
 * A quote scanned in from a supplier: printed document totals, or a printed
 * line total on any line. The classic editor shows its reconciliation panel
 * only then; voice, typed and drawing quotes carry neither.
 */
export function hasSupplierSource(
  source: SupplierSource | null | undefined,
  items: readonly QuoteLineItem[],
): boolean {
  return (
    !!source &&
    (source.subtotal != null ||
      source.gst != null ||
      source.total != null ||
      items.some((it) => it.source_line_total != null))
  );
}

export interface ReconciliationOptions {
  /** The quote's currency, as the editor holds it. */
  currency: string;
  /** The quote's tax rate as a percentage (15 = 15 %). */
  taxRate: number;
}

/**
 * The classic editor's reconciliation: the SAME deterministic validator the
 * import screen uses (validateSupplierQuote), over the live lines, so
 * "supplier vs app" reads identically on the final Review Quote. Null for a
 * quote with no supplier source.
 */
export function supplierReconciliation(
  source: SupplierSource | null | undefined,
  items: readonly QuoteLineItem[],
  { currency, taxRate }: ReconciliationOptions,
): QuoteValidationReport | null {
  if (!hasSupplierSource(source, items)) return null;
  return validateSupplierQuote(
    {
      supplier: source?.supplier ?? null,
      quote_number: null,
      currency,
      gst_inclusive: false, // source values are stored ex-GST already
      items: items.map((it) => ({
        name: it.description,
        unit: it.unit,
        price: Number(it.unit_price) || null,
        sku: null,
        quantity: Number(it.quantity) || null,
        pieces: null,
        source_line_total: it.source_line_total ?? null,
        raw_text: null,
        confidence: 1,
      })),
      subtotal: source?.subtotal ?? null,
      gst: source?.gst ?? null,
      total: source?.total ?? null,
      notes: [],
    },
    { taxRate: taxRate / 100 },
  );
}

/** A line the classic panel flags, with its "use supplier value" button. */
export interface ReconciliationMismatch {
  it: QuoteLineItem;
  idx: number;
  /** Its line-total check: `found` is the supplier's printed total, `expected` qty × unit price. */
  check: ValidationCheck & { found: number };
}

/**
 * The lines the classic panel lists: a printed line total more than 2c off
 * qty × unit price. A line with no price or no quantity is only a warning
 * there, so it isn't listed.
 */
export function reconciliationMismatches(
  report: QuoteValidationReport,
  items: readonly QuoteLineItem[],
): ReconciliationMismatch[] {
  return items.flatMap((it, idx) => {
    const check = report.lines[idx]?.checks[0];
    return check && check.found != null && check.severity === "error"
      ? [{ it, idx, check: check as ValidationCheck & { found: number } }]
      : [];
  });
}

/**
 * "Use supplier value": the unit price that makes a line's total the
 * supplier's printed line total. Full precision, because a cent-rounded unit
 * price can't reproduce the source total (10,000 × $0.0435 is not
 * 10,000 × $0.04). Null (nothing to do) without a printed line total or a
 * quantity above 0.
 */
export function supplierSnapPrice(
  line: Pick<QuoteLineItem, "quantity" | "source_line_total">,
): number | null {
  if (line.source_line_total == null) return null;
  const qty = Number(line.quantity);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return preciseUnitPrice(line.source_line_total / qty);
}

/**
 * A line with the supplier's value: exactly what the classic editor's
 * updateItem does with that unit price (the shared trust rule, then a cents
 * line total). A line with nothing to snap comes back as it is.
 */
export function withSupplierPrice(line: QuoteLineItem): QuoteLineItem {
  const price = supplierSnapPrice(line);
  if (price === null) return line;
  const next = applyLineEdit(line, { unit_price: price });
  next.line_total = round2((Number(next.quantity) || 0) * (Number(next.unit_price) || 0));
  return next;
}

/* ── 2. The send gate's checks ─────────────────────────────────────────── */

/** The send gate's supplier tolerance (quote-validation.ts, PHASE 4). */
export const SUPPLIER_TOLERANCE = 0.02;

/**
 * A line copied from the supplier's quote: it carries their printed line
 * total, or at least their description (a row printed without a total). The
 * gate checks exactly these. Lines the tradie adds carry neither, and nor do
 * the freight and discount lines made from the supplier's totals.
 */
export function isSupplierLine(line: QuoteLineItem): boolean {
  return line.source_line_total != null || line.source_description != null;
}

/** qty × unit price to the cent: the live total the gate compares. */
export function liveLineTotal(line: Pick<QuoteLineItem, "quantity" | "unit_price">): number {
  return round2((Number(line.quantity) || 0) * (Number(line.unit_price) || 0));
}

export interface SupplierLineCheck {
  /** Index in quote_data.line_items. */
  index: number;
  line: QuoteLineItem;
  /** Their printed line total, on the quote's ex-GST basis; null when they printed none. */
  supplierTotal: number | null;
  /** qty × unit price now, to the cent. */
  liveTotal: number;
  /** The gate blocks on it: the live total is more than 2c off theirs. */
  mismatch: boolean;
  /** For a mismatch, the exact unit price that fixes it; null when it can't be worked out (no quantity). */
  snapPrice: number | null;
}

export interface SupplierSubtotalCheck {
  /** Their subtotal, on the quote's ex-GST basis. */
  supplier: number;
  /** Their lines on this quote added up as the gate does: each at its printed total, or its live total when none was printed. */
  lines: number;
  /** lines − supplier, to the cent: below 0 something of theirs is missing, above 0 something is extra. */
  difference: number;
  /** The gate blocks on it. */
  mismatch: boolean;
}

/** What the send gate will block on, for the job page's callout and the send screen. */
export interface SupplierMismatches {
  supplier: string | null;
  /** Their lines whose live total no longer matches theirs. */
  lines: SupplierLineCheck[];
  /** Their subtotal against their lines here, only when it's off. */
  subtotal: SupplierSubtotalCheck | null;
  /** Things to fix: each line, plus one for the subtotal. 0 = the gate's supplier checks pass. */
  count: number;
}

function quoteLines(data: QuoteData): QuoteLineItem[] {
  return Array.isArray(data?.line_items) ? data.line_items : [];
}

function supplierName(data: QuoteData): string | null {
  const name = data?.supplier_source?.supplier;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Every supplier line, checked the way the gate checks it. */
function lineChecks(items: readonly QuoteLineItem[]): SupplierLineCheck[] {
  return items.flatMap((line, index) => {
    if (!isSupplierLine(line)) return [];
    const liveTotal = liveLineTotal(line);
    const supplierTotal = line.source_line_total ?? null;
    const mismatch = supplierTotal != null && Math.abs(liveTotal - supplierTotal) > SUPPLIER_TOLERANCE;
    return [{ index, line, supplierTotal, liveTotal, mismatch, snapPrice: mismatch ? supplierSnapPrice(line) : null }];
  });
}

/** The gate's subtotal check; null when it doesn't run (no printed subtotal, or no printed line totals). */
function subtotalCheck(data: QuoteData, checks: readonly SupplierLineCheck[]): SupplierSubtotalCheck | null {
  const supplier = data?.supplier_source?.subtotal ?? null;
  if (supplier == null || !checks.some((c) => c.supplierTotal != null)) return null;
  const lines = round2(checks.reduce((sum, c) => sum + (c.supplierTotal ?? c.liveTotal), 0));
  return {
    supplier,
    lines,
    difference: round2(lines - supplier),
    mismatch: Math.abs(lines - supplier) > SUPPLIER_TOLERANCE,
  };
}

/**
 * What's off against the supplier's quote, by the send gate's own rules:
 * count 0 exactly when its supplier checks pass (always, for a quote not
 * made from a supplier's quote).
 */
export function supplierMismatches(data: QuoteData): SupplierMismatches {
  const checks = lineChecks(quoteLines(data));
  const lines = checks.filter((c) => c.mismatch);
  const subtotal = subtotalCheck(data, checks);
  const off = subtotal?.mismatch ? subtotal : null;
  return { supplier: supplierName(data), lines, subtotal: off, count: lines.length + (off ? 1 : 0) };
}

/* ── The new-look sheet's picture ──────────────────────────────────────── */

/** One of their lines taken off since the quote was scanned in. */
export interface RemovedSupplierLine {
  /** The line as scanned in, its supplier source and all. */
  line: QuoteLineItem;
  /** Its index in the scanned-in lines (identifies it). */
  from: number;
  /** Where it goes back: after the line of theirs before it that is still here. */
  insertAt: number;
}

/** One of their lines on this quote more often than on their quote. */
export interface RepeatedSupplierLine {
  /** Its first copy here. */
  line: QuoteLineItem;
  /** Every copy's index here. */
  indexes: number[];
  /** Copies too many. */
  extra: number;
}

/** Why their lines don't add up to their subtotal, as far as the quote can tell. */
export interface SupplierGap {
  /** Lines taken off since the scan (known only from the scanned-in lines). */
  removed: RemovedSupplierLine[];
  /** Lines on here too often. */
  repeated: RepeatedSupplierLine[];
  /** The lines above don't account for the whole difference. */
  unexplained: boolean;
  /** Their rows printed without a total: they count at this quote's price. */
  ownPrice: SupplierLineCheck[];
  /** Rows the scan couldn't read off their quote, as read. */
  unread: string[];
}

export interface SupplierCheck {
  supplier: string | null;
  /** Their printed figures: subtotal (ex-GST basis) and total. */
  printed: { subtotal: number | null; total: number | null };
  /** Every line from their quote, in page order. */
  rows: SupplierLineCheck[];
  /** The rows the gate blocks on. */
  mismatched: SupplierLineCheck[];
  /** The mismatched rows the supplier's value fixes. */
  fixable: SupplierLineCheck[];
  /** Their subtotal against their lines here; null when the gate doesn't check it. */
  subtotal: SupplierSubtotalCheck | null;
  /** When the subtotal is off: what we can tell about why. */
  gap: SupplierGap | null;
  /** Lines that aren't their line items (the tradie's own, freight or discount from their totals): not checked. */
  others: Array<{ index: number; line: QuoteLineItem }>;
  /** Nothing left for the send gate's supplier checks to block on. */
  fixed: boolean;
}

/** What identifies one of their lines: the source fields, which edits never touch. */
function supplierKey(line: QuoteLineItem): string {
  return JSON.stringify([
    line.source_description ?? null,
    line.source_quantity ?? null,
    line.source_unit ?? null,
    line.source_unit_price ?? null,
    line.source_line_total ?? null,
  ]);
}

/** What a line adds to the gate's sum of their lines. */
function gapValue(line: QuoteLineItem): number {
  return line.source_line_total ?? liveLineTotal(line);
}

function indexesByKey(items: readonly QuoteLineItem[]): Map<string, number[]> {
  const byKey = new Map<string, number[]>();
  items.forEach((line, index) => {
    if (!isSupplierLine(line)) return;
    const key = supplierKey(line);
    byKey.set(key, [...(byKey.get(key) ?? []), index]);
  });
  return byKey;
}

/** Their lines scanned in but no longer here, each with where it goes back. */
function removedLines(items: readonly QuoteLineItem[], imported: readonly QuoteLineItem[]): RemovedSupplierLine[] {
  const waiting = new Map([...indexesByKey(items)].map(([key, at]) => [key, [...at]]));
  // Where each scanned-in line of theirs is now (null: taken off).
  const now = imported.map((line) => (isSupplierLine(line) ? (waiting.get(supplierKey(line))?.shift() ?? null) : undefined));
  return imported.flatMap((line, from) => {
    if (now[from] !== null) return [];
    const before = now.slice(0, from).reverse().find((at): at is number => typeof at === "number");
    const after = now.slice(from + 1).find((at): at is number => typeof at === "number");
    const insertAt = before !== undefined ? before + 1 : (after ?? Math.min(from, items.length));
    return [{ line, from, insertAt }];
  });
}

/** Their lines on here more often than they were scanned in (or than once, without the scanned-in lines). */
function repeatedLines(
  items: readonly QuoteLineItem[],
  imported: readonly QuoteLineItem[] | null,
): RepeatedSupplierLine[] {
  const scanned = imported ? indexesByKey(imported) : null;
  return [...indexesByKey(items)].flatMap(([key, indexes]) => {
    const extra = indexes.length - (scanned ? (scanned.get(key)?.length ?? 0) : 1);
    return extra > 0 ? [{ line: items[indexes[0]], indexes, extra }] : [];
  });
}

function supplierGap(
  data: QuoteData,
  items: readonly QuoteLineItem[],
  rows: readonly SupplierLineCheck[],
  subtotal: SupplierSubtotalCheck,
  imported: readonly QuoteLineItem[] | null,
): SupplierGap {
  const removed = imported ? removedLines(items, imported) : [];
  // Without the scanned-in lines a repeat may be on their quote too: name it
  // only when deleting its copies closes some of a gap that's too high.
  const repeated = repeatedLines(items, imported).filter(
    (r) => imported || (subtotal.difference > 0 && r.extra * gapValue(r.line) <= subtotal.difference + SUPPLIER_TOLERANCE),
  );
  const explained = round2(
    repeated.reduce((sum, r) => sum + r.extra * gapValue(r.line), 0) -
      removed.reduce((sum, r) => sum + gapValue(r.line), 0),
  );
  const unexplained = Math.abs(subtotal.difference - explained) > SUPPLIER_TOLERANCE;
  const failures = data?.supplier_source?.row_failures;
  return {
    removed,
    repeated,
    unexplained,
    ownPrice: rows.filter((r) => r.supplierTotal == null),
    unread: Array.isArray(failures)
      ? failures.flatMap((f) => (typeof f?.raw_text === "string" && f.raw_text.trim() ? [f.raw_text.trim()] : []))
      : [],
  };
}

/**
 * The supplier check sheet's whole picture, by the send gate's rules: their
 * printed figures, each of their lines against its live total, the subtotal,
 * and when that's off, which lines to put back or delete. `imported` is the
 * quote's lines as scanned in (quotes.ai_snapshot) — only they can name a
 * line taken off since. Null for a quote not made from a supplier's quote.
 */
export function supplierCheck(
  data: QuoteData,
  imported: readonly QuoteLineItem[] | null = null,
): SupplierCheck | null {
  const items = quoteLines(data);
  const source = data?.supplier_source ?? null;
  if (!source && !items.some(isSupplierLine)) return null;
  const rows = lineChecks(items);
  const mismatched = rows.filter((r) => r.mismatch);
  const subtotal = subtotalCheck(data, rows);
  const scanned = Array.isArray(imported) ? imported : null;
  return {
    supplier: supplierName(data),
    printed: { subtotal: source?.subtotal ?? null, total: source?.total ?? null },
    rows,
    mismatched,
    fixable: mismatched.filter((r) => r.snapPrice !== null),
    subtotal,
    gap: subtotal?.mismatch ? supplierGap(data, items, rows, subtotal, scanned) : null,
    others: items.flatMap((line, index) => (isSupplierLine(line) ? [] : [{ index, line }])),
    fixed: mismatched.length === 0 && !subtotal?.mismatch,
  };
}

/* ── Fixes ─────────────────────────────────────────────────────────────── */

/**
 * The lines with the supplier's value on every one of their lines the gate
 * flags (or only those at `indexes`). Lines that match, can't be snapped or
 * aren't theirs stay exactly as they are.
 */
export function withSupplierValues(
  lines: readonly QuoteLineItem[],
  indexes?: readonly number[],
): QuoteLineItem[] {
  const only = indexes ? new Set(indexes) : null;
  const fix = new Set(
    lineChecks(lines)
      .filter((c) => c.mismatch && c.snapPrice !== null && (!only || only.has(c.index)))
      .map((c) => c.index),
  );
  return lines.map((line, index) => (fix.has(index) ? withSupplierPrice(line) : line));
}

/** The lines with one of theirs taken off since the scan put back where it was, supplier source and all. */
export function withLineBack(lines: readonly QuoteLineItem[], removed: RemovedSupplierLine): QuoteLineItem[] {
  const at = Math.max(0, Math.min(removed.insertAt, lines.length));
  return [...lines.slice(0, at), { ...removed.line }, ...lines.slice(at)];
}
