import type { QuoteProfile } from "./quote-types";

/**
 * Wave 14.4 — client-name placeholder handling.
 *
 * The AI quote-generation pipeline writes "To be confirmed" into
 * `quote_data.client.name` whenever the voice transcript doesn't
 * mention a client. We don't want that placeholder leaking into the
 * UI — tradies found it confusing ("why does it say to be confirmed
 * on every quote?"). Display surfaces filter it out via these
 * helpers; the AI prompt itself is unchanged (do-not-touch list).
 */
const PLACEHOLDER_NAMES = new Set(["", "to be confirmed", "tbc", "tbd"]);

export function isPlaceholderClientName(name?: string | null): boolean {
  return PLACEHOLDER_NAMES.has((name ?? "").trim().toLowerCase());
}

/** Returns the name if real, or `fallback` (default "—") when it's a placeholder. */
export function displayClientName(
  name?: string | null,
  fallback = "—",
): string {
  return isPlaceholderClientName(name) ? fallback : (name as string);
}

export const NZ_DEFAULTS: QuoteProfile = {
  business_name: null,
  country: "NZ",
  default_labour_rate: 75,
  default_markup_pct: 20,
  tax_label: "GST",
  tax_rate: 15,
  currency: "NZD",
};

const CURRENCY_LOCALE: Record<string, string> = {
  NZD: "en-NZ",
  AUD: "en-AU",
  GBP: "en-GB",
  USD: "en-US",
  CAD: "en-CA",
};

export function formatCurrency(amount: number, currency: string, maximumFractionDigits = 2): string {
  const locale = CURRENCY_LOCALE[currency] ?? "en-NZ";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function quoteNumber(id: string, createdAt: string | Date): string {
  const year = new Date(createdAt).getFullYear();
  const short = id.replace(/-/g, "").slice(0, 4).toUpperCase();
  return `Q-${year}-${short}`;
}

// IMPORTANT: pin the timeZone. Without it, Intl formats in the runtime's local
// zone — so the server (UTC on Vercel) and a NZ visitor's browser turn the same
// timestamp into different calendar days near a day boundary. When this runs in a
// client component (QuotesListClient) that's a hydration mismatch (React #418).
// Pinning to Pacific/Auckland makes SSR and client identical AND shows NZ dates.
export function formatIssueDate(d: string | Date): string {
  return new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Pacific/Auckland",
  }).format(new Date(d));
}

export function validUntilDate(createdAt: string | Date, days = 30): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + days);
  return d;
}

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Hard bounds on the two user-editable percentage inputs that feed
 * `computeQuoteTotals`. These are typo guards, not business rules: a markup
 * of 900% or a GST rate of 155% is always a slipped digit, and without a
 * clamp it flows silently into a customer-facing total. Limits are generous
 * enough that no legitimate trade pricing hits them.
 */
export const MAX_MARKUP_PCT = 200;
export const MAX_TAX_RATE = 50;

export function clampMarkupPct(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, MAX_MARKUP_PCT);
}

export function clampTaxRate(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(v, MAX_TAX_RATE);
}

/**
 * The single source of truth for quote totals.
 *
 * Every total displayed or persisted (AI generation, the save action, and
 * the live editor) must run through this so the numbers can never drift
 * apart. The rule is SUM-OF-ROUNDED: each line is rounded to cents the
 * same way it is shown to the tradie (`line_total`), then the rounded
 * lines are summed. Summing the raw products and rounding once at the end
 * (round-of-sum) produces a subtotal that the visible line items don't add
 * up to — that mismatch was the "numbers don't match the total" bug.
 *
 * `materials_subtotal` deliberately includes "other" line items (markup
 * applies to both), matching the AI prompt contract and the eval suite.
 */
export function computeQuoteTotals(
  lineItems: ReadonlyArray<{
    type: string;
    quantity: number;
    unit_price: number;
  }>,
  markupPct: number,
  taxRate: number,
) {
  let materials_subtotal = 0;
  let labour_subtotal = 0;
  for (const it of lineItems) {
    const line_total = round2(
      (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    );
    if (it.type === "labour") labour_subtotal += line_total;
    else materials_subtotal += line_total;
  }
  materials_subtotal = round2(materials_subtotal);
  labour_subtotal = round2(labour_subtotal);
  const markup_amount = round2(materials_subtotal * ((Number(markupPct) || 0) / 100));
  const subtotal_before_tax = round2(
    materials_subtotal + markup_amount + labour_subtotal,
  );
  const tax_amount = round2(subtotal_before_tax * ((Number(taxRate) || 0) / 100));
  const total = round2(subtotal_before_tax + tax_amount);
  return {
    materials_subtotal,
    labour_subtotal,
    markup_amount,
    subtotal_before_tax,
    tax_amount,
    total,
  };
}

/** Money equality within a tolerance (default 1 cent) — for reconciling
 *  printed vs computed figures without tripping on sub-cent rounding. */
export function moneyEquals(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(round2(a) - round2(b)) <= tolerance;
}

export type GstBreakdown = {
  /** Amount BEFORE tax (GST-exclusive). */
  exclusive: number;
  /** The tax portion. */
  gst: number;
  /** Amount INCLUDING tax (GST-inclusive). */
  inclusive: number;
  /** The rate used, as a percentage (e.g. 15 for NZ). */
  rate: number;
};

/**
 * Add GST on top of a GST-EXCLUSIVE amount.
 * NZ example: addGst(3380, 15) → { exclusive: 3380, gst: 507, inclusive: 3887 }.
 * This is the direction quote totals are built (tax applied last, on top of the
 * ex-GST subtotal), so it matches `computeQuoteTotals`.
 */
export function addGst(exclusiveAmount: number, rate = 15): GstBreakdown {
  const exclusive = round2(exclusiveAmount);
  const gst = round2(exclusive * ((Number(rate) || 0) / 100));
  return { exclusive, gst, inclusive: round2(exclusive + gst), rate };
}

/**
 * Decompose a GST-INCLUSIVE amount back into its ex-GST and GST parts.
 * NZ example: gstInclusiveBreakdown(3887, 15) →
 *   { inclusive: 3887, exclusive: 3380.87, gst: 506.13 }.
 * Note this is NOT the inverse of `addGst` at the cent level: 3380 + 15% = 3887
 * (GST 507), but 3887 decomposed = ex 3380.87 / GST 506.13. Both are correct —
 * they answer different questions ("add GST to 3380" vs "how much GST is inside
 * 3887"). Use this when a supplier figure is quoted GST-inclusive.
 */
export function gstInclusiveBreakdown(
  inclusiveAmount: number,
  rate = 15,
): GstBreakdown {
  const inclusive = round2(inclusiveAmount);
  const exclusive = round2(inclusive / (1 + (Number(rate) || 0) / 100));
  return { inclusive, exclusive, gst: round2(inclusive - exclusive), rate };
}

/**
 * Split a quote's line items into the two display subtotals shown as
 * separate rows on the totals card / PDF / public quote: "Materials"
 * (type `material`) and "Other" (type `other`). SUM-OF-ROUNDED so each row
 * ties out to its visible section.
 *
 * Single source of the display-split rule — replaced three copy-pasted
 * reduce blocks (editor, public summary, PDF). Display-only:
 * computeQuoteTotals bundles material+other into materials_subtotal
 * because markup applies to the bundle.
 */
export function splitDisplaySubtotals(
  lineItems: ReadonlyArray<{
    type: string;
    quantity?: number;
    unit_price?: number;
    line_total?: number | null;
  }>,
): { materials: number; other: number } {
  const amount = (it: {
    quantity?: number;
    unit_price?: number;
    line_total?: number | null;
  }): number =>
    it.line_total != null
      ? round2(Number(it.line_total) || 0)
      : round2((Number(it.quantity) || 0) * (Number(it.unit_price) || 0));
  const sumOf = (type: string) =>
    round2(
      lineItems
        .filter((it) => it.type === type)
        .reduce((s, it) => s + amount(it), 0),
    );
  return { materials: sumOf("material"), other: sumOf("other") };
}
