/**
 * Variation Agent — pure variation-draft generator.
 *
 * Given an existing quote and a description of the variation work
 * (reason + line items the tradie types or pastes), produces a draft
 * variation document with totals, GST math, and a printable approval
 * text the tradie can send to the client.
 *
 * The original quote total is NEVER mutated by this function. The
 * caller stores the variation either in:
 *   • UI state (export-only, no DB), or
 *   • A future `variations` table (does not exist yet — see the report
 *     for the schema this expects).
 *
 * No I/O, no Anthropic, no Supabase. Deterministic and testable.
 */
import type { QuoteData } from "@/lib/quote-types";
import { round2 } from "@/lib/quote-defaults";

export type VariationLineType = "labour" | "material" | "other";

export interface VariationLineInput {
  description: string;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  type?: VariationLineType;
}

export interface VariationLine extends VariationLineInput {
  /** quantity * unit_price, rounded to 2 dp. */
  line_total: number;
}

export interface VariationDraftInput {
  /** Anchor quote — its currency, tax rate, and client copy through. */
  baseQuote: QuoteData;
  /** Why the variation is being raised (1–3 sentences). */
  reason: string;
  /** Each row of new work being added. */
  lines: VariationLineInput[];
  /** Optional override; falls back to base quote's tax rate. */
  taxRatePct?: number;
}

export interface VariationDraft {
  reason: string;
  lines: VariationLine[];
  currency: string;
  taxRatePct: number;
  variationSubtotal: number;
  variationTax: number;
  variationTotal: number;
  /** Original total — surfaced for the approval text, never changed. */
  baseQuoteTotal: number;
  /** baseQuoteTotal + variationTotal. */
  newTotal: number;
  /** Plain-text body suitable for email or SMS. */
  approvalText: string;
  /** Any blocking validation messages. Empty array = good to draft. */
  blockers: string[];
}

function formatMoney(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency,
      currencyDisplay: "symbol",
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function runVariationAgent(input: VariationDraftInput): VariationDraft {
  const blockers: string[] = [];
  const reason = input.reason.trim();
  if (reason.length === 0) {
    blockers.push("Reason for the variation is empty.");
  }
  if (!input.lines || input.lines.length === 0) {
    blockers.push("Variation has no line items — add at least one row.");
  }

  const currency = input.baseQuote.currency || "NZD";
  const taxRatePct =
    typeof input.taxRatePct === "number" && Number.isFinite(input.taxRatePct)
      ? input.taxRatePct
      : Number(input.baseQuote.tax_rate) || 0;

  const lines: VariationLine[] = (input.lines ?? []).map((l) => {
    const q = Number(l.quantity) || 0;
    const p = Number(l.unit_price) || 0;
    return {
      description: (l.description ?? "").trim(),
      quantity: q,
      unit: l.unit ?? null,
      unit_price: round2(p),
      type: l.type ?? "other",
      line_total: round2(q * p),
    };
  });

  for (const l of lines) {
    if (l.description.length === 0) {
      blockers.push("One of the variation lines is missing a description.");
      break;
    }
  }

  const variationSubtotal = round2(
    lines.reduce((s, l) => s + l.line_total, 0),
  );
  const variationTax = round2(variationSubtotal * (taxRatePct / 100));
  const variationTotal = round2(variationSubtotal + variationTax);
  const baseQuoteTotal = round2(Number(input.baseQuote.total) || 0);
  const newTotal = round2(baseQuoteTotal + variationTotal);

  const clientName = input.baseQuote.client?.name?.trim() || "Client";
  const businessName = ""; // intentionally blank — caller may inject

  const lineSummary = lines
    .map(
      (l) =>
        `• ${l.description}${l.quantity && l.quantity !== 1 ? ` × ${l.quantity}${l.unit ? ` ${l.unit}` : ""}` : ""} — ${formatMoney(l.line_total, currency)}`,
    )
    .join("\n");

  const approvalText = [
    `Hi ${clientName},`,
    "",
    "Quick note about a variation to your quote:",
    "",
    reason || "(reason pending)",
    "",
    "New work:",
    lineSummary || "(no lines)",
    "",
    `Variation subtotal: ${formatMoney(variationSubtotal, currency)}`,
    `${taxRatePct > 0 ? `GST (${taxRatePct}%): ${formatMoney(variationTax, currency)}\n` : ""}Variation total: ${formatMoney(variationTotal, currency)}`,
    "",
    `Original quote total: ${formatMoney(baseQuoteTotal, currency)}`,
    `New total once approved: ${formatMoney(newTotal, currency)}`,
    "",
    "Reply 'approved' to confirm and I'll proceed. Original quote stays as-is until you do.",
    "",
    businessName,
  ]
    .join("\n")
    .trim();

  return {
    reason,
    lines,
    currency,
    taxRatePct,
    variationSubtotal,
    variationTax,
    variationTotal,
    baseQuoteTotal,
    newTotal,
    approvalText,
    blockers,
  };
}
