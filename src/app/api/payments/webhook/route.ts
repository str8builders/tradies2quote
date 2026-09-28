import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe-client";
import { ledgerForgetEvent, ledgerRecordEvent } from "@/lib/stripe-webhook-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook
 *
 * Deposit payments webhook — entirely separate from /api/stripe/webhook
 * (subscriptions). Verified with STRIPE_PAYMENTS_WEBHOOK_SECRET so the two
 * endpoints can never cross-process each other's events.
 *
 * Idempotent: marks the seeded `payments` row paid by its id (from session
 * metadata). Re-delivery lands the same row state.
 *
 * The processed-events ledger is keyed on (endpoint, event id): Stripe sends
 * the same checkout.session.completed to the subscriptions webhook too, and
 * whichever recorded it first used to make the other skip it as a duplicate
 * (see src/lib/stripe-webhook-ledger.ts).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const raw = await request.text();
  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    captureError(e, { route: "payments/webhook" });
    console.error("[payments/webhook] bad signature", e);
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  const admin = adminClient();

  // Idempotency ledger: record this endpoint's copy of the event first. A
  // duplicate Stripe delivery hits the unique key and we ack without
  // re-processing.
  const claim = await ledgerRecordEvent(admin, "payments", event.id, event.type);
  if (claim.ok && claim.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (!claim.ok) {
    // Non-conflict ledger error: log and continue — the payments UPDATE
    // below is id-keyed + status-guarded, so processing stays safe.
    console.error("[payments/webhook] ledger insert failed", claim.error);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentId = session.metadata?.payment_id;
      const quoteId = session.metadata?.quote_id;
      if (paymentId && session.payment_status === "paid") {
        const { error: paidErr } = await admin
          .from("payments")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
          })
          .eq("id", paymentId)
          // Idempotency: a Stripe redelivery of an already-paid row must
          // not overwrite paid_at with a fresh timestamp. Only the first
          // delivery (status still pending) performs the write.
          .neq("status", "paid");
        // A failed write must be retried, never acknowledged: the deposit
        // would otherwise stay "pending" for good.
        if (paidErr) throw paidErr;

        // Close the double-payment window: any OTHER checkout session for
        // this quote (second tab, stale link) stays payable for up to 24h
        // after creation — expire them now that the deposit is in.
        if (quoteId) {
          const { data: siblings, error: siblingsErr } = await admin
            .from("payments")
            .select("id, status, stripe_checkout_session_id")
            .eq("quote_id", quoteId)
            .neq("id", paymentId);
          if (siblingsErr) throw siblingsErr;
          const stripe = stripeClient();
          for (const p of siblings ?? []) {
            if (p.status === "pending" && p.stripe_checkout_session_id) {
              try {
                await stripe.checkout.sessions.expire(p.stripe_checkout_session_id);
              } catch {
                // Already expired/completed — nothing to do.
              }
              await admin
                .from("payments")
                .update({ status: "expired" })
                .eq("id", p.id)
                .eq("status", "pending");
            } else if (p.status === "paid") {
              // Two paid deposits on one quote — surface loudly so the
              // owner can refund one; never hide taken money.
              captureError(
                new Error(`Duplicate paid deposit on quote ${quoteId}`),
                { route: "payments/webhook" },
              );
            }
          }
        }
      }
    }
  } catch (e) {
    captureError(e, { route: "payments/webhook" });
    console.error("[payments/webhook] handler failed", e);
    // Return 500 so Stripe RETRIES. This endpoint's ledger row must be
    // removed first, or the retry would be deduped as already-processed and
    // the deposit silently lost. (Never the subscriptions webhook's row.)
    const forgot = await ledgerForgetEvent(admin, "payments", event.id);
    if (forgot.error) console.error("[payments/webhook] ledger release failed", forgot.error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
