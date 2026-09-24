import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { captureError } from "@/lib/observability";
import { regenerateRefusalMessage } from "@/lib/lifecycle/lock";

/**
 * Regenerate a quote from an edited cleaned transcript.
 *
 *   POST /api/quotes/[id]/transcript/regenerate
 *     body: { cleanedTranscript: string }
 *
 * Behaviour:
 *
 *   1. Update `voice_transcript` with the edited text — that becomes
 *      the new authoritative input for Claude.
 *   2. Clear `quote_data` to null so the existing 409-on-existing-quote_
 *      data check in /api/quotes/generate doesn't block us.
 *   3. Return `{ ok: true }`.
 *
 * The client then refreshes /app/quotes/preview/[id]. Because
 * `quote_data` is now null, the preview page renders `QuoteGenerator`,
 * which auto-POSTs to /api/quotes/generate. The new transcript drives a
 * fresh quote — including a fresh `transcript.raw`, `transcript.cleaned`,
 * compliance review, and material match — so all post-edit state stays
 * coherent.
 *
 * Privacy: voice_transcript is the same column the original transcribe
 * route writes to. The public RPC does not return it. The post-regen
 * transcript object is built by /api/quotes/generate and lives inside
 * quote_data — same privacy contract as before.
 *
 * Drafts only (audit 2026-09-24). Regenerating wipes every line and the
 * total, so a quote the client has already been sent — or has accepted,
 * or that is scheduled/underway/invoiced — answers 409 instead. The write
 * itself is conditional on `status = 'draft'` so a send racing this
 * request cannot be wiped either.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { id: string };

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

  // Same write-gate as /api/quotes/generate. Without it an expired-trial user
  // could repeatedly null quote_data + retrigger generation (cost + churn).
  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt: new Date(user.created_at ?? Date.now()),
    email: user.email,
  });
  if (!canWrite(sub)) {
    return NextResponse.json(
      {
        error: "trial_expired",
        message:
          "Your free trial has ended. Subscribe to keep regenerating quotes.",
        upgrade_url: "/app/upgrade",
      },
      { status: 402 },
    );
  }

  let body: { cleanedTranscript?: unknown };
  try {
    body = (await request.json()) as { cleanedTranscript?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const cleaned = body.cleanedTranscript;
  if (typeof cleaned !== "string" || cleaned.trim().length === 0) {
    return NextResponse.json(
      { error: "cleanedTranscript must be a non-empty string" },
      { status: 400 },
    );
  }

  // Defence-in-depth: confirm the quote belongs to this user before
  // mutating. RLS handles this too, but spell it out for clarity.
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("id, user_id, status")
    .eq("id", id)
    .single();
  if (error || !quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if (quote.user_id !== user.id) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  if ((quote.status ?? "draft") !== "draft") {
    return NextResponse.json(
      { error: regenerateRefusalMessage(quote.status), code: "not_draft" },
      { status: 409 },
    );
  }

  const { data: cleared, error: uErr } = await supabase
    .from("quotes")
    .update({
      voice_transcript: cleaned,
      // Clearing quote_data triggers the QuoteGenerator on the client
      // to fire /api/quotes/generate against the new transcript.
      quote_data: null,
      total_amount: null,
    })
    .eq("id", quote.id)
    .eq("user_id", user.id)
    // Re-checked in the write itself: a send landing between the read
    // above and this update must not be wiped.
    .eq("status", "draft")
    .select("id");
  if (uErr) {
    console.error("[transcript] regenerate prep update failed", uErr);
    captureError(uErr, { route: "quotes/transcript/regenerate" });
    return NextResponse.json(
      { error: "Failed to clear existing quote for regeneration" },
      { status: 500 },
    );
  }
  if (!cleared || cleared.length === 0) {
    return NextResponse.json(
      // The status moved on between the read and the write (e.g. sent).
      { error: regenerateRefusalMessage("sent"), code: "not_draft" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true });
}
