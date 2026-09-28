/**
 * Prices as the CLIENT sees them.
 *
 * The tradie's markup is private to the business. Client documents (the public
 * quote page, the quote PDF, the invoice PDF) and the customer-chat AI never
 * show it as its own row; it is folded into the prices of the lines it applies
 * to instead.
 *
 * computeQuoteTotals (quote-defaults.ts) applies the markup to every line that
 * is not labour (materials and "other"), so exactly those lines carry it here;
 * labour is shown as the tradie priced it. The markup is shared out in
 * proportion to each line's own total and rounded to whole cents by largest
 * remainder, so the client's lines add up to EXACTLY the tradie's subtotal.
 * The subtotal, tax and total themselves never change.
 *
 * A marked-up line's unit price is re-derived from its client total: the
 * shortest price (2 to 12 decimals) for which quantity × price rounds to that
 * total, so every line still reads quantity × price = total.
 *
 * Pure and idempotent: applying it to a view it already produced changes
 * nothing.
 */
import { round2 } from "./quote-defaults.ts";
import type { PublicQuotePayload, QuoteData } from "./quote-types";

type PricedLine = {
  type: string;
  quantity: number;
  unit_price: number;
  line_total?: number | null;
};

/**
 * The most a markup can multiply the lines it applies to: 1 + MAX_MARKUP_PCT
 * (200%), with room for cent rounding. Stored totals that imply more (or that
 * would zero the lines or flip their sign) no longer match their lines, and
 * are left alone rather than turned into odd prices.
 */
const MAX_FOLD_RATIO = 3.05;

/** Whole cents of a stored money value (blank or not a number → 0). */
function toCents(value: unknown): number {
  return Math.round(round2(Number(value) || 0) * 100);
}

/** A line's total as it is shown today: its stored line_total, else quantity × unit price. */
function lineCents(line: PricedLine): number {
  const stored = line.line_total;
  if (stored !== null && stored !== undefined && Number.isFinite(Number(stored))) {
    return toCents(stored);
  }
  return toCents((Number(line.quantity) || 0) * (Number(line.unit_price) || 0));
}

/** Lines the markup applies to — the same split computeQuoteTotals makes. */
function carriesMarkup(line: { type: string }): boolean {
  return line.type !== "labour";
}

/**
 * Share `total` cents out in proportion to `weights` (whole cents, not summing
 * to zero): each share is within a cent of its exact value and the shares add
 * up to exactly `total`. Exact integer arithmetic (BigInt), so large quotes
 * don't pick up floating-point error.
 */
export function allocateCents(weights: readonly number[], total: number): number[] {
  const zero = BigInt(0);
  const one = BigInt(1);
  const target = BigInt(total);
  let denominator = BigInt(weights.reduce((sum, w) => sum + w, 0));
  let numerators = weights.map((w) => BigInt(w) * target);
  if (denominator < zero) {
    denominator = -denominator;
    numerators = numerators.map((n) => -n);
  }
  const floors = numerators.map((n) => {
    const q = n / denominator; // truncates toward zero
    return n % denominator !== zero && n < zero ? q - one : q;
  });
  const remainders = numerators.map((n, i) => n - floors[i] * denominator);
  let left = Number(target - floors.reduce((sum, f) => sum + f, zero));
  const order = weights
    .map((_, i) => i)
    .sort((a, b) => {
      if (remainders[a] !== remainders[b]) return remainders[b] > remainders[a] ? 1 : -1;
      return Math.abs(weights[b]) - Math.abs(weights[a]) || a - b;
    });
  const out = floors.map((f) => Number(f));
  for (const i of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * The shortest unit price (2 to 12 decimals) whose quantity × price rounds to
 * `totalCents`. A zero quantity keeps `fallback` (to four decimals).
 */
export function unitPriceFor(quantity: number, totalCents: number, fallback: number): number {
  const q = Number(quantity) || 0;
  if (q === 0) return Number((Number(fallback) || 0).toFixed(4));
  const exact = totalCents / 100 / q;
  for (let digits = 2; digits <= 12; digits++) {
    const candidate = Number(exact.toFixed(digits));
    if (toCents(q * candidate) === totalCents) return candidate;
  }
  return exact;
}

/**
 * The lines with the markup folded into every line that carries it, so they
 * add up to `subtotalBeforeTax`. Returns copies; labour lines keep their
 * prices. Nothing is folded when the subtotal is missing, when there is
 * nothing to fold, or when the stored figures no longer match the lines.
 */
export function foldMarkupIntoLines<L extends PricedLine>(
  lines: readonly L[],
  subtotalBeforeTax: unknown,
): L[] {
  const copies = lines.map((line) => ({ ...line }));
  const subtotal = subtotalBeforeTax === null || subtotalBeforeTax === "" ? Number.NaN : Number(subtotalBeforeTax);
  if (!Number.isFinite(subtotal) || lines.length === 0) return copies;

  const base = lines.map(lineCents);
  const marked = lines.flatMap((line, i) => (carriesMarkup(line) ? [i] : []));
  const markedBase = marked.reduce((sum, i) => sum + base[i], 0);
  const fold = toCents(subtotal) - base.reduce((sum, c) => sum + c, 0);
  if (fold === 0 || markedBase === 0) return copies;

  const markedTotal = markedBase + fold;
  const ratio = markedTotal / markedBase;
  if (!(ratio > 0 && ratio <= MAX_FOLD_RATIO)) return copies;

  const shares = allocateCents(
    marked.map((i) => base[i]),
    markedTotal,
  );
  marked.forEach((lineIndex, k) => {
    const line = copies[lineIndex];
    const cents = shares[k];
    line.unit_price = unitPriceFor(line.quantity, cents, (Number(line.unit_price) || 0) * ratio);
    line.line_total = cents / 100;
  });
  return copies;
}

/** Subtotal rows that tie out to the (folded) lines. */
function subtotalsOf(lines: readonly PricedLine[]): { materials: number; labour: number } {
  let materials = 0;
  let labour = 0;
  for (const line of lines) {
    if (carriesMarkup(line)) materials += lineCents(line);
    else labour += lineCents(line);
  }
  return { materials: materials / 100, labour: labour / 100 };
}

/**
 * A quote (or an invoice snapshot, which has the same shape) priced for the
 * client: markup folded into the lines, `markup_pct` and `markup_amount` zero,
 * the materials and labour subtotals re-added from the lines. Subtotal, tax
 * and total are unchanged; every other field is passed through.
 */
export function quoteDataForClient(quote: QuoteData): QuoteData {
  const lines = foldMarkupIntoLines(Array.isArray(quote.line_items) ? quote.line_items : [], quote.subtotal_before_tax);
  const { materials, labour } = subtotalsOf(lines);
  return {
    ...quote,
    line_items: lines,
    materials_subtotal: materials,
    labour_subtotal: labour,
    markup_pct: 0,
    markup_amount: 0,
  };
}

/** The public quote payload (get_quote_by_token) priced for the client, as quoteDataForClient. */
export function publicQuoteForClient(quote: PublicQuotePayload): PublicQuotePayload {
  const lines = foldMarkupIntoLines(Array.isArray(quote.line_items) ? quote.line_items : [], quote.subtotal_before_tax);
  const { materials, labour } = subtotalsOf(lines);
  return {
    ...quote,
    line_items: lines,
    materials_subtotal: materials,
    labour_subtotal: labour,
    markup_amount: 0,
  };
}
