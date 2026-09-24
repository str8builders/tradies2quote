/**
 * Quote line rules for the new job page. Pure: tested in node.
 *
 * Edits follow the classic editor exactly (QuoteEditor's updateItem /
 * confirmQuantity / addItem, which stay untouched): the shared trust rule
 * `applyLineEdit`, a cents-rounded line total, a typed quantity making an AI
 * quantity the tradie's own, and a real quantity recovering a blocked
 * "needs dimensions" line. saveQuoteChanges then recomputes and stores the
 * same numbers on the server.
 */

import {
  clampMarkupPct,
  clampTaxRate,
  computeQuoteTotals,
  round2,
  splitDisplaySubtotals,
} from "@/lib/quote-defaults";
import type { QuoteClient, QuoteData, QuoteItemType, QuoteLineItem } from "@/lib/quote-types";
import { formatQuantity } from "@/lib/quantity-display";
import { isUnpricedLine } from "@/lib/quote-validation";
import { applyLineEdit } from "@/lib/t2qcalLineEdit";

/** Mirrors QuoteEditor.updateItem. */
export function updateLine(item: QuoteLineItem, patch: Partial<QuoteLineItem>): QuoteLineItem {
  const next = applyLineEdit(item, patch);
  next.line_total = round2((Number(next.quantity) || 0) * (Number(next.unit_price) || 0));
  if (patch.quantity !== undefined && next.quantity_source === "ai") {
    next.quantity_source = "user";
    next.quantity_confirmed = true;
  }
  if (patch.quantity !== undefined && next.takeoff_status === "blocked" && (Number(next.quantity) || 0) > 0) {
    next.takeoff_status = undefined;
    next.takeoff_flags = [];
    next.is_calculated_takeoff = false;
    next.quantity_source = "user";
    next.quantity_confirmed = true;
  }
  return next;
}

/** Mirrors QuoteEditor.confirmQuantity: the tradie agrees with the estimate. */
export function confirmLineQuantity(item: QuoteLineItem): QuoteLineItem {
  return { ...item, quantity_confirmed: true };
}

/** Mirrors QuoteEditor.addItem's blank line. */
export function blankLine(type: QuoteItemType): QuoteLineItem {
  return {
    type,
    description: "",
    quantity: 1,
    unit: type === "labour" ? "hour" : "each",
    unit_price: 0,
    line_total: 0,
  };
}

/** An AI-estimated material quantity nobody has confirmed (hard-blocks sending). */
export function hasUnconfirmedQuantity(item: QuoteLineItem): boolean {
  return item.type === "material" && item.quantity_source === "ai" && item.quantity_confirmed !== true;
}

/** A line the tradie should look at before sending: guessed, flagged or missing info. */
export function lineNeedsCheck(item: QuoteLineItem): boolean {
  return (
    hasUnconfirmedQuantity(item) ||
    item.takeoff_status === "blocked" ||
    item.takeoff_status === "needs_review" ||
    item.takeoff_status === "assumed"
  );
}

export type LineMarker = "check" | "price" | null;

/**
 * The one plain marker a line card shows. "Check this" wins over "Needs
 * price": an unchecked quantity blocks sending, a $0 line only asks first.
 */
export function lineMarker(item: QuoteLineItem): LineMarker {
  if (lineNeedsCheck(item)) return "check";
  if (isUnpricedLine(item)) return "price";
  return null;
}

/** Indexes of lines that would quote at $0 (the send gate's own rule). */
export function unpricedIndexes(lines: readonly QuoteLineItem[]): number[] {
  return lines.flatMap((line, index) => (isUnpricedLine(line) ? [index] : []));
}

export function checkIndexes(lines: readonly QuoteLineItem[]): number[] {
  return lines.flatMap((line, index) => (lineNeedsCheck(line) ? [index] : []));
}

export interface LineGroup {
  type: QuoteItemType;
  title: string;
  rows: Array<{ line: QuoteLineItem; index: number }>;
  subtotal: number;
}

const GROUPS: ReadonlyArray<{ type: QuoteItemType; title: string }> = [
  { type: "labour", title: "Labour" },
  { type: "material", title: "Materials" },
  { type: "other", title: "Other" },
];

/** Labour, then materials, then other; empty groups left out. */
export function groupLines(lines: readonly QuoteLineItem[]): LineGroup[] {
  return GROUPS.flatMap(({ type, title }) => {
    const rows = lines.flatMap((line, index) => (line.type === type ? [{ line, index }] : []));
    if (rows.length === 0) return [];
    const subtotal = round2(rows.reduce((sum, { line }) => sum + (Number(line.line_total) || 0), 0));
    return [{ type, title, rows, subtotal }];
  });
}

/** "28 each", "12.5 m²", "3 day". */
export function quantityText(item: QuoteLineItem): string {
  const unit = (item.unit ?? "").trim();
  return `${formatQuantity(item.quantity, Number(item.unit_price) || 0)}${unit ? ` ${unit}` : ""}`;
}

/**
 * The quote as saveQuoteChanges will store it: numbers coerced, every line
 * total qty × price rounded, markup and tax clamped, totals recomputed. The
 * page shows (and pre-checks sending against) exactly what the server saves.
 */
export function withLines(
  base: QuoteData,
  lines: readonly QuoteLineItem[],
  client: QuoteClient = base.client,
): QuoteData {
  const items = lines.map((it) => {
    const quantity = Number(it.quantity) || 0;
    const unit_price = Number(it.unit_price) || 0;
    return { ...it, quantity, unit_price, line_total: round2(quantity * unit_price) };
  });
  const markup_pct = clampMarkupPct(base.markup_pct);
  const tax_rate = clampTaxRate(base.tax_rate);
  return {
    ...base,
    client,
    line_items: items,
    markup_pct,
    tax_rate,
    // An empty currency breaks every money format; the classic editor saves NZD.
    currency: base.currency || "NZD",
    ...computeQuoteTotals(items, markup_pct, tax_rate),
  };
}

export interface TotalsBreakdown {
  materials: number;
  other: number;
  markup: number;
  markupPct: number;
  labour: number;
  beforeTax: number;
  tax: number;
  taxLabel: string;
  taxRate: number;
  total: number;
}

/** The "how it adds up" rows, split the same way as the classic totals card. */
export function totalsBreakdown(data: QuoteData): TotalsBreakdown {
  const { materials, other } = splitDisplaySubtotals(data.line_items);
  return {
    materials,
    other,
    markup: data.markup_amount,
    markupPct: data.markup_pct,
    labour: data.labour_subtotal,
    beforeTax: data.subtotal_before_tax,
    tax: data.tax_amount,
    taxLabel: data.tax_label || "GST",
    taxRate: data.tax_rate,
    total: data.total,
  };
}

/* ── The line edit sheet ──────────────────────────────────────────────── */

export interface LineForm {
  description: string;
  /** Typed digits, e.g. "12.5". */
  quantity: string;
  unit: string;
  /** Typed digits, e.g. "3.85"; "" means no price. */
  price: string;
  /** "The quantity is right" for an AI estimate. */
  quantityChecked: boolean;
}

function numberText(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? formatQuantity(n) : "";
}

/** The form as the sheet opens on an existing line. */
export function lineForm(item: QuoteLineItem): LineForm {
  const price = Number(item.unit_price) || 0;
  return {
    description: item.description ?? "",
    quantity: numberText(item.quantity),
    unit: item.unit ?? "",
    price: price > 0 ? String(price) : "",
    quantityChecked: !hasUnconfirmedQuantity(item),
  };
}

function parseTyped(value: string): number | null {
  const trimmed = value.trim();
  if (!/\d/.test(trimmed)) return null;
  const n = Number(trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed);
  return Number.isFinite(n) ? n : null;
}

export type LineFormProblem = "description" | "quantity" | "price" | null;

/** What stops the form saving, if anything. */
export function lineFormProblem(form: LineForm): LineFormProblem {
  if (!form.description.trim()) return "description";
  const quantity = parseTyped(form.quantity);
  if (quantity === null || quantity < 0) return "quantity";
  if (form.price.trim() !== "" && parseTyped(form.price) === null) return "price";
  return null;
}

/**
 * The fields the tradie actually changed. Quantity and price are compared as
 * typed text against the form the sheet opened with, so an untouched value
 * is never re-saved from its rounded display text.
 */
export function linePatch(
  original: QuoteLineItem,
  form: LineForm,
  opened: LineForm = lineForm(original),
): Partial<QuoteLineItem> {
  const patch: Partial<QuoteLineItem> = {};
  const description = form.description.trim();
  if (description !== (original.description ?? "").trim()) patch.description = description;
  if (form.quantity.trim() !== opened.quantity.trim()) {
    const quantity = parseTyped(form.quantity);
    if (quantity !== null && quantity !== Number(original.quantity)) patch.quantity = quantity;
  }
  const unit = form.unit.trim();
  if (unit !== (original.unit ?? "").trim()) patch.unit = unit;
  if (form.price.trim() !== opened.price.trim()) {
    const price = form.price.trim() === "" ? 0 : parseTyped(form.price);
    if (price !== null && price !== (Number(original.unit_price) || 0)) patch.unit_price = price;
  }
  return patch;
}

/** Changing the unit clears an untouched price (applyLineEdit's trust rule). */
export function unitChangeClearsPrice(original: QuoteLineItem, form: LineForm, opened: LineForm = lineForm(original)): boolean {
  return (
    form.unit.trim() !== (original.unit ?? "").trim() &&
    form.price.trim() === opened.price.trim() &&
    (Number(original.unit_price) || 0) > 0
  );
}

/** The line after the sheet's Save: the classic edit rules, then the quantity tick. */
export function applyLineForm(original: QuoteLineItem, form: LineForm, opened: LineForm = lineForm(original)): QuoteLineItem {
  const patch = linePatch(original, form, opened);
  const edited = Object.keys(patch).length > 0 ? updateLine(original, patch) : original;
  return form.quantityChecked && hasUnconfirmedQuantity(edited) ? confirmLineQuantity(edited) : edited;
}

export function blankLineForm(type: QuoteItemType): LineForm {
  const blank = blankLine(type);
  return { description: "", quantity: "1", unit: blank.unit, price: "", quantityChecked: true };
}

/** A new line from the "Add a line" sheet (the classic add-then-type path). */
export function newLineFromForm(type: QuoteItemType, form: LineForm): QuoteLineItem {
  const blank = blankLine(type);
  return updateLine(blank, linePatch(blank, form, blankLineForm(type)));
}

export function linesEqual(a: QuoteLineItem, b: QuoteLineItem): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Plain words for a failed save (the lock message gets its own). */
export function saveErrorMessage(error: string | null | undefined, lockedMessage: string): string {
  if (error === lockedMessage) return "This quote has been accepted, so its lines can't change now.";
  if (error === "Quote not found.") return "We couldn't find this quote. Go back to your jobs and open it again.";
  return "That didn't save. Check your signal and try again.";
}
