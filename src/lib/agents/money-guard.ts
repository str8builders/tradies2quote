import type { PublicQuotePayload } from "@/lib/quote-types";

/**
 * Dollar figures an agent may write to a customer: the ones printed on the
 * quote, and the ones the customer wrote. An agent that works out a new
 * number — the gap to the customer's offer ("$1,200 off"), a discount, a
 * revised total — is caught here and asked once to rewrite without it (the
 * agent runtime's validation retry). Found by the release guardrail evals
 * (src/eval/agent-guardrails-eval.test.ts).
 */

// "$12,204.46", "NZ$9,800", "A$500", "£1,250", "€90", "$11k", "NZD 500"
const PREFIXED =
  /(?:(?:nz|au|a|us|ca|c)?\$|£|€|\b(?:nzd|aud|usd|cad|gbp|eur)\s?)\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(\s?k\b)?/gi;
// "600 dollars", "2,500 bucks", "75 NZD", "300 quid"
const SUFFIXED =
  /\b(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(\s?k)?\s?(?:dollars|bucks|quid|pounds|nzd|aud|usd|cad|gbp|eur)\b/gi;

/** Money amounts written in text. Percentages, quantities and sizes are not money. */
export function moneyAmountsIn(text: string): number[] {
  const out: number[] = [];
  for (const re of [PREFIXED, SUFFIXED]) {
    for (const m of text.matchAll(re)) {
      const n = Number(m[1].replace(/,/g, "") + (m[2] ?? ""));
      if (Number.isFinite(n)) out.push(m[3] ? n * 1000 : n);
    }
  }
  return out;
}

/** Amounts in `text` that are none of `allowed` (to the cent). */
export function inventedAmounts(text: string, allowed: readonly number[]): number[] {
  const ok = allowed.filter((a) => Number.isFinite(a)).map((a) => Math.round(a * 100));
  return moneyAmountsIn(text).filter(
    (n) => n > 0 && !ok.some((c) => Math.abs(c - Math.round(n * 100)) <= 1),
  );
}

/**
 * Every figure printed on a public quote, plus the split for each percentage
 * in its terms ("50% deposit" → the deposit and the balance), which the agent
 * may work out from what the customer is reading.
 */
export function publicQuoteFigures(q: PublicQuotePayload): number[] {
  const total = Number(q.total);
  const out = [
    ...q.line_items.flatMap((l) => [Number(l.unit_price), Number(l.line_total)]),
    Number(q.materials_subtotal),
    Number(q.labour_subtotal),
    Number(q.markup_amount),
    Number(q.subtotal_before_tax),
    Number(q.tax_amount),
    total,
  ];
  if (Number.isFinite(total)) {
    for (const m of (q.terms ?? "").matchAll(/(\d{1,3}(?:\.\d+)?)\s?%/g)) {
      const pct = Number(m[1]);
      if (pct > 0 && pct < 100) {
        out.push(Math.round(total * pct) / 100, Math.round(total * (100 - pct)) / 100);
      }
    }
  }
  return out.filter((n) => Number.isFinite(n));
}

/** The validation error the agent gets back, asking it to rewrite. */
export function inventedFigureError(invented: readonly number[], where: string): string {
  const list = invented.map((n) => `$${n.toLocaleString("en-NZ", { maximumFractionDigits: 2 })}`).join(", ");
  return `${where} states ${list}, which is not on the quote and not in the customer's message. Only write dollar figures that are printed on the quote or that the customer wrote. Never work out a difference, discount, deposit or new total. Rewrite it without that figure.`;
}
