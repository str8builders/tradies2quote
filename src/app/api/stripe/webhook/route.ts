import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import type Stripe from "stripe";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured, stripeClient } from "@/lib/stripe-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook
 *
 * Stripe events flow through here. We:
 *   1. Verify the signature against STRIPE_WEBHOOK_SECRET — anything
 *      that fails the check is dropped with 400.
 *   2. Switch on event.type and update `public.subscriptions` to
 *      reflect the current state.
 *
 * The webhook is the ONLY writer of `subscriptions.status` and
 * `current_period_end` — the checkout route just seeds the row.
 *
 * Idempotency:
 *   Stripe retries with the same event id on non-2xx responses, so
 *   every handler is a pure upsert/update keyed on `user_id` (pulled
 *   from session.metadata or subscription.metadata). Re-running the
 *   same event lands the same row state.
 *
 * Events we care about:
 *   - checkout.session.completed     → first-time activation
 *   - customer.subscription.created  → same as above, redundant safety
 *   - customer.subscription.updated  → plan change, cancel-at-period-end, etc.
 *   - customer.subscription.deleted  → end of life — mark canceled
 *   - invoice.paid                   → no row change needed (status already 'active')
 *                                       but useful to log for analytics later
 *   - invoice.payment_failed         → Stripe will retry; we leave the row
 *                                       as-is and let subscription.updated do
 *                                       the work when status changes to past_due
 */
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "no_webhook_secret" },
      { status: 503 },
    );
  }

  // Stripe verifies against the RAW body bytes — req.text() preserves
  // them exactly (req.json() would lose the original formatting).
  const rawBody = await request.text();

  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    captureError(err, { route: "stripe/webhook" });
    console.error(
      "Stripe webhook signature verification failed",
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "bad_signature" },
      { status: 400 },
    );
  }

  const admin = adminClient();

  // This table records COMPLETED events. A crash before the subscription
  // write must leave the event retryable, never permanently acknowledged.
  const { data: completed, error: ledgerReadError } = await admin
    .from("stripe_webhook_events")
    .select("event_id")
    .eq("event_id", event.id)
    .maybeSingle();
  if (ledgerReadError) {
    captureError(ledgerReadError, { route: "stripe/webhook" });
    return NextResponse.json({ error: "ledger_unavailable" }, { status: 500 });
  }
  if (completed) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.t2q_user_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;
        // One-time payments share the Stripe account but cannot grant a subscription.
        if (session.mode !== "subscription") break;
        if (!userId || !customerId || !subscriptionId) {
          console.warn(
            "checkout.session.completed without t2q_user_id or customer",
            { sessionId: session.id },
          );
          throw new Error("Subscription checkout is missing its account mapping.");
        }

        // Read the full subscription so we get accurate status + period_end.
        let status: string | null = "active";
        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = sub.status;
          // current_period_end is on each item rather than the top-level
          // subscription in newer API versions; fall back to the first item.
          const item = sub.items?.data?.[0];
          if (item?.current_period_end) {
            periodEnd = new Date(item.current_period_end * 1000).toISOString();
          }
        }

        const { error: saveError } = await admin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status,
            current_period_end: periodEnd,
            plan: "pro_monthly",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" },
        );
        if (saveError) throw saveError;
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        // Stripe does not guarantee delivery order. Retrieve its current state
        // so a late "created"/"updated" event cannot replay its old snapshot.
        const snapshot = event.data.object as Stripe.Subscription;
        const sub = await stripe.subscriptions.retrieve(snapshot.id);
        const userId = sub.metadata?.t2q_user_id;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!customerId) {
          console.warn("subscription event without customer", {
            subId: sub.id,
            type: event.type,
          });
          break;
        }

        const item = sub.items?.data?.[0];
        const periodEnd = item?.current_period_end
          ? new Date(item.current_period_end * 1000).toISOString()
          : null;

        // .deleted events arrive with status:"canceled" — same code path
        // as a normal update.
        const patch = {
          stripe_customer_id: customerId,
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        };

        if (userId) {
          // Preferred path: we have the user id from metadata so the
          // upsert handles "user never had a row" gracefully.
          const { error: saveError } = await admin
            .from("subscriptions")
            .upsert({ ...patch, user_id: userId }, { onConflict: "user_id" });
          if (saveError) throw saveError;
        } else {
          // Fallback: match by stripe_customer_id. Won't fire on the
          // first event for a brand-new customer (no row yet) but
          // checkout.session.completed handler above covers that case.
          const { data: updated, error: saveError } = await admin
            .from("subscriptions")
            .update(patch)
            .eq("stripe_customer_id", customerId)
            .select("user_id");
          if (saveError) throw saveError;
          if (!updated?.length) throw new Error("Subscription customer is not mapped yet.");
        }
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        // No row mutation here — the subscription.updated event will
        // carry the new status (active / past_due) and the period end
        // is bumped there too. This case exists so unhandled-event
        // logging stays clean.
        break;
      }

      default: {
        // Acknowledged but no handler. Logging quietly — Stripe sends
        // a lot of types we don't care about (charge.*, payment_intent.*).
        break;
      }
    }
    const { error: ledgerError } = await admin
      .from("stripe_webhook_events")
      .insert({ event_id: event.id, type: event.type });
    // Concurrent successful handling is safe; all other errors must retry.
    if (ledgerError && ledgerError.code !== "23505") throw ledgerError;
  } catch (err) {
    captureError(err, { route: "stripe/webhook" });
    // If a handler throws, return 500 so Stripe retries. Be careful:
    // any DB write that DID succeed will run again — that's why every
    // path uses upsert/update with stable keys (idempotent).
    console.error(
      "Stripe webhook handler failed",
      event.type,
      err instanceof Error ? err.message : String(err),
    );
    return NextResponse.json(
      { error: "handler_failed", type: event.type },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true });
}
