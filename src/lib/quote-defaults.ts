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

/**
 * Tax label + rate a business gets when its profile leaves them unset,
 * keyed by the business country. There is no settings field for the label,
 * so without this every UK/US/CA document printed "GST", and a blank rate
 * silently became NZ's 15%. US sales tax varies by state (0 until the
 * tradie sets it); Canada defaults to the federal 5% GST.
 */
export type TaxDefaults = { tax_label: string; tax_rate: number };

export const COUNTRY_TAX_DEFAULTS: Readonly<Record<"NZ" | "AU" | "UK" | "US" | "CA", TaxDefaults>> = {
  NZ: { tax_label: "GST", tax_rate: 15 },
  AU: { tax_label: "GST", tax_rate: 10 },
  UK: { tax_label: "VAT", tax_rate: 20 },
  US: { tax_label: "Tax", tax_rate: 0 },
  CA: { tax_label: "Tax", tax_rate: 5 },
};

const CURRENCY_COUNTRY: Record<string, keyof typeof COUNTRY_TAX_DEFAULTS> = {
  NZD: "NZ",
  AUD: "AU",
  GBP: "UK",
  USD: "US",
  CAD: "CA",
};

/** The business's tax country: its country when known, else inferred from its currency, else NZ. */
export function taxCountryFor(
  country?: string | null,
  currency?: string | null,
): keyof typeof COUNTRY_TAX_DEFAULTS {
  const c = (country ?? "").trim().toUpperCase();
  if (c === "GB") return "UK";
  if (c in COUNTRY_TAX_DEFAULTS) return c as keyof typeof COUNTRY_TAX_DEFAULTS;
  return CURRENCY_COUNTRY[(currency ?? "").trim().toUpperCase()] ?? "NZ";
}

export function taxDefaultsFor(
  country?: string | null,
  currency?: string | null,
): TaxDefaults {
  return COUNTRY_TAX_DEFAULTS[taxCountryFor(country, currency)];
}

/** Labels that are only ever a country default, never a tradie's own choice. */
const GENERIC_TAX_LABELS = new Set(["GST", "VAT", "TAX"]);

/**
 * The tax label to print. A blank label, or a generic default label that
 * belongs to another country (the column's "GST" on a UK profile), becomes
 * the business country's label; any other stored label (e.g. "HST") is kept.
 */
export function resolveTaxLabel(
  storedLabel: string | null | undefined,
  country?: string | null,
  currency?: string | null,
): string {
  const fallback = taxDefaultsFor(country, currency).tax_label;
  const stored = (storedLabel ?? "").trim();
  if (!stored) return fallback;
  if (
    GENERIC_TAX_LABELS.has(stored.toUpperCase()) &&
    stored.toUpperCase() !== fallback.toUpperCase()
  ) {
    return fallback;
  }
  return stored;
}

/** A blank / non-numeric stored rate falls back to the country default (never NZ's 15% for everyone). */
export function resolveTaxRate(
  storedRate: unknown,
  country?: string | null,
  currency?: string | null,
): number {
  const blank =
    storedRate === null ||
    storedRate === undefined ||
    (typeof storedRate === "string" && storedRate.trim() === "") ||
    !Number.isFinite(Number(storedRate));
  return clampTaxRate(
    blank ? taxDefaultsFor(country, currency).tax_rate : storedRate,
  );
}

const CURRENCY_LOCALE: Record<string, string> = {
  NZD: "en-NZ",
  AUD: "en-AU",
  GBP: "en-GB",
  USD: "en-US",
  CAD: "en-CA",
};

const CURRENCY_SYMBOL: Record<string, string> = { NZD: "$", AUD: "$", USD: "$", CAD: "$", GBP: "£", EUR: "€" };

/**
 * Currency label rendered identically on the server and in every browser.
 * Intl currency output differs between ICU builds (symbol, spacing), which
 * made client components trip React hydration error #418; the digits and
 * grouping are the only Intl part every engine agrees on, so the symbol is
 * spelled here. Unknown codes keep the Intl fallback.
 */
export function formatCurrency(amount: number, currency: string, maximumFractionDigits = 2): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const symbol = CURRENCY_SYMBOL[currency];
  if (!symbol) {
    const locale = CURRENCY_LOCALE[currency] ?? "en-NZ";
    return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits }).format(safe);
  }
  const digits = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, maximumFractionDigits) }).format(Math.abs(safe));
  const negative = safe < 0 && digits !== new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, maximumFractionDigits) }).format(0);
  return `${negative ? "-" : ""}${symbol}${digits}`;
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

/**
 * THE round-to-cents helper — every money surface (generation, the editor,
 * the save action, the send gate, PDFs via stored totals) goes through it.
 *
 * Exact half-up (half away from zero): the value is scaled to cents and the
 * binary floating-point noise is stripped by re-reading it at 15 significant
 * digits before rounding. Plain `Math.round(n * 100) / 100` rounds the
 * half-cent DOWN whenever the double sits a hair below it — 15% GST on $1.50
 * (0.22499999999999998) gave $0.22 and a typed $1.005 gave $1.00.
 */
export function round2(n: number): number {
  if (!Number.isFinite(n) || n === 0) return 0;
  const cents = Number((Math.abs(n) * 100).toPrecision(15));
  const rounded = Math.round(cents) / 100;
  return n < 0 ? -rounded : rounded;
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
