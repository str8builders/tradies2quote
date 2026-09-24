import type {
  GeneratedQuote,
  LineItemCategory,
} from "@/lib/agents/quote-generation";
import {
  quoteVerifyEnabledFromEnv,
  verifyQuote,
  type VerificationReport,
} from "@/lib/agents/verify/quoteVerify";
import { captureError } from "@/lib/observability";
import type { QuoteData, QuoteItemType } from "@/lib/quote-types";

const CATEGORY: Record<QuoteItemType, LineItemCategory> = {
  material: "materials",
  labour: "labour",
  other: "sundries",
};

/**
 * Map a pipeline QuoteData onto the verifier's GeneratedQuote shape. The
 * pipeline keeps markup OUT of line totals (it is `markup_amount` on top),
 * stores the tax rate as a percentage, and leaves AI-guessed prices blank
 * (`is_missing_price`) — all three are carried across so the checks judge
 * the quote on its own terms.
 */
export function quoteDataToGeneratedQuote(q: QuoteData): GeneratedQuote {
  return {
    jobName: typeof q.job_summary === "string" ? q.job_summary : "",
    clientName: q.client?.name ?? "",
    lineItems: (q.line_items ?? []).map((it) => ({
      description: it.description,
      quantity: Number(it.quantity) || 0,
      unit: it.unit,
      unitPrice: Number(it.unit_price) || 0,
      lineTotal: Number(it.line_total) || 0,
      category: CATEGORY[it.type] ?? "materials",
      pricePending: it.is_missing_price === true,
    })),
    subtotal: Number(q.subtotal_before_tax) || 0,
    markupAmount: Number(q.markup_amount) || 0,
    gstRate: (Number(q.tax_rate) || 0) / 100,
    taxLabel: q.tax_label,
    gstAmount: Number(q.tax_amount) || 0,
    total: Number(q.total) || 0,
    notes: Array.isArray(q.notes) ? q.notes : [],
    terms: typeof q.terms === "string" ? q.terms : "",
  };
}

/**
 * Run the verification pass on a freshly generated quote: deterministic
 * checks always, the LLM critic when QUOTE_VERIFY_ENABLED=true. Advisory
 * and failure-safe — any error returns null and the quote saves without a
 * report. The critic keeps its own token cap / effort handling.
 */
export async function verifyGeneratedQuote(
  q: QuoteData,
  transcript: string,
  opts: { runCritic?: boolean } = {},
): Promise<VerificationReport | null> {
  try {
    return await verifyQuote({
      quote: quoteDataToGeneratedQuote(q),
      transcript,
      runCritic: opts.runCritic ?? quoteVerifyEnabledFromEnv(),
    });
  } catch (e) {
    captureError(e, { route: "quotes/generate:verify" });
    return null;
  }
}
