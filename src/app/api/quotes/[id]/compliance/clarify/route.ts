import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  complianceReviewEnabledFromEnv,
  safelyReviewQuote,
  type WallContext,
} from "@/lib/compliance";
import type { QuoteData } from "@/lib/quote-types";
import { isQuoteLocked, QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";

/**
 * Compliance clarification round-trip.
 *
 *   POST /api/quotes/[id]/compliance/clarify
 *     body: { wall?: Partial<WallContext> }
 *
 * Loads the existing quote, augments the JobContext with the user's
 * answers, re-runs the compliance review, and saves the updated review
 * onto `quote_data.compliance_review`. Line items are NOT regenerated —
 * the engine only changes per-line compliance metadata, never the
 * material decisions themselves (a future iteration could re-run the
 * matcher when treatment class is clarified, but for v1 we keep the
 * scope tight).
 *
 * Response shape: { ok: true, status, clarifications, warnings, citations }
 *
 * Failure modes:
 *   - Unauth → 401
 *   - Quote not found → 404
 *   - Quote has no quote_data yet → 409 (engine has nothing to review)
 *   - Engine throws → safe wrapper folds it into status='error' (200 OK)
 *
 * The engine is gated on the same `NZ_COMPLIANCE_REVIEW_ENABLED` flag
 * the generation route uses. With the flag off, this endpoint just
 * returns a status='disabled' review without touching the DB.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

type Body = {
  wall?: Partial<WallContext>;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, voice_transcript, quote_data, user_id, status")
    .eq("id", id)
    .single();
  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.user_id !== user.id) {
    // Defence-in-depth on top of RLS — refuse cross-user clarification.
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  // A clarification round rewrites quote_data.line_items, so it is an edit:
  // refused once the client has accepted (the invoice bills these lines).
  if (isQuoteLocked(quote.status)) {
    return NextResponse.json({ error: QUOTE_LOCKED_MESSAGE }, { status: 409 });
  }

  const quoteData = quote.quote_data as QuoteData | null;
  if (!quoteData) {
    return NextResponse.json(
      { error: "Quote has not been generated yet" },
      { status: 409 },
    );
  }

  // Build the augmented JobContext. Existing wall context (if any from a
  // prior clarification round) is overwritten by the new answers — the
  // form only sends fields the user just confirmed; missing fields stay
  // unset and the engine will re-emit those questions next round.
  const existingReview = (quoteData.compliance_review ?? null) as
    | { context?: { wall?: Partial<WallContext> } }
    | null;
  const mergedWall: Partial<WallContext> = {
    ...(existingReview?.context?.wall ?? {}),
    ...(body.wall ?? {}),
  };

  const review = await safelyReviewQuote(
    quoteData.line_items,
    {
      description: (quote.voice_transcript ?? "").trim(),
      wall: mergedWall as WallContext,
    },
    { enabled: complianceReviewEnabledFromEnv() },
  );

  // Persist the updated review (and the merged wall context, so a
  // subsequent round of clarifications builds on the prior one).
  const updatedQuoteData: QuoteData = {
    ...quoteData,
    line_items: review.items as typeof quoteData.line_items,
    compliance_review: {
      status: review.status,
      clarifications: review.clarifications,
      warnings: review.warnings,
      citations: review.citations,
      diagnostics: review.diagnostics,
      // Stash the answer state so subsequent rounds keep it.
      context: { wall: mergedWall },
    },
  };

  const { error: uErr } = await supabase
    .from("quotes")
    .update({ quote_data: updatedQuoteData })
    .eq("id", quote.id);
  if (uErr) {
    console.error("[compliance] clarify update failed", uErr);
    return NextResponse.json(
      { error: "Failed to save clarifications" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: review.status,
    clarifications: review.clarifications,
    warnings: review.warnings,
    citations: review.citations,
  });
}
