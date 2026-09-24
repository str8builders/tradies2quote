import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { subscriptionPlan } from "@/lib/stripe-subscription";
import { isStripeConfigured, stripeClient, planForPrice } from "@/lib/stripe-client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (!isStripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "no_webhook_secret" }, { status: 503 });
  const stripe = stripeClient();
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await request.text(), sig, secret); }
  catch (error) {
    // Two causes look identical here: a forged or test request (rejected, as it
    // should be) or a signing secret in app.env that no longer matches the
    // Stripe endpoint. Stripe's dashboard tells them apart — real failed
    // deliveries are listed on the endpoint; forged requests never are. The
    // 12–20 Sep 2026 reports were forged/test requests (every Stripe delivery
    // to this endpoint returned 200).
    captureError(
      new Error(
        "Stripe webhook signature rejected: a forged/test request, or STRIPE_WEBHOOK_SECRET no longer matches the endpoint (check the endpoint's failed deliveries in Stripe).",
        { cause: error },
      ),
      { route: "stripe/webhook" },
    );
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }
  const admin = adminClient();
  const ledger = await admin.from("stripe_webhook_events").select("event_id").eq("event_id", event.id).maybeSingle();
  if (ledger.error) return NextResponse.json({ error: "ledger_unavailable" }, { status: 500 });
  if (ledger.data) return NextResponse.json({ received: true, duplicate: true });
  try {
    let subscriptionId: string | null = null;
    let checkout: Stripe.Checkout.Session | null = null;
    if (event.type === "checkout.session.completed") {
      checkout = event.data.object as Stripe.Checkout.Session;
      // Other products in this account have no Tradies2Quote metadata.
      if (checkout.mode === "subscription" && checkout.metadata?.t2q_user_id) {
        if (typeof checkout.subscription !== "string" || typeof checkout.customer !== "string") throw new Error("Checkout account mapping is incomplete.");
        subscriptionId = checkout.subscription;
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      subscriptionId = (event.data.object as Stripe.Subscription).id;
    }
    if (subscriptionId) {
      // Record before retrieving: a slow, older read must not overwrite a later read.
      const observedAt = new Date().toISOString();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = subscriptionPlan(sub, planForPrice);
      if (plan) {
        const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        if (checkout && (sub.metadata?.t2q_user_id !== checkout.metadata?.t2q_user_id || customer !== checkout.customer)) throw new Error("Checkout subscription mapping does not match.");
        const end = sub.items.data[0]?.current_period_end;
        const result = await admin.rpc("sync_stripe_subscription", { p_data: {
          id: sub.id, customer, user_id: sub.metadata?.t2q_user_id || null, plan, status: sub.status,
          created: sub.created, observed_at: observedAt, period_end: end ? new Date(end * 1000).toISOString() : null,
        } });
        if (result.error) throw result.error;
      } else if (checkout?.metadata?.t2q_user_id) throw new Error("Checkout price is not a supported app plan.");
    }
    // Mark complete only after the state write succeeds; failed writes remain retryable.
    const saved = await admin.from("stripe_webhook_events").insert({ event_id: event.id, type: event.type });
    if (saved.error && saved.error.code !== "23505") throw saved.error;
    return NextResponse.json({ received: true });
  } catch (error) {
    captureError(error, { route: "stripe/webhook" });
    return NextResponse.json({ error: "handler_failed", type: event.type }, { status: 500 });
  }
}
