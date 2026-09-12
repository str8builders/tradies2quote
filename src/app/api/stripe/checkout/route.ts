import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  getPlanPriceId,
  isStripeConfigured,
  stripeClient,
} from "@/lib/stripe-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/checkout
 *
 * Mints a Stripe Checkout session for the single $49/mo plan and
 * returns its hosted URL. Client should redirect (window.location =
 * url). We use checkout-session redirect (not embedded checkout)
 * because:
 *   - No publishable key needed on the client
 *   - Stripe owns the entire payment surface — PCI, SCA, 3DS all
 *     handled by them
 *   - Mobile-friendly out of the box
 *
 * Customer creation:
 *   - First time the user hits this, we create a Stripe Customer and
 *     write the id into `subscriptions.stripe_customer_id`.
 *   - On retry, we reuse the existing customer so Stripe doesn't end
 *     up with duplicate Customers for the same user.
 *
 * Session metadata carries the t2q user_id so the webhook can match
 * the subscription back to a row in our DB without a lookup table.
 */
export async function POST(_request: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      {
        error: "stripe_not_configured",
        message:
          "Subscription checkout isn't set up yet. Set STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET.",
      },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const priceId = getPlanPriceId();
  if (!priceId) {
    return NextResponse.json(
      {
        error: "no_price_configured",
        message: "STRIPE_PRICE_ID is missing.",
      },
      { status: 503 },
    );
  }

  const admin = adminClient();
  const stripe = stripeClient();

  // Wrap every Stripe + admin-DB call in a single try/catch so any
  // upstream failure (Stripe rate limit, network blip, customer-create
  // race, malformed price id, etc.) is surfaced to the client as a
  // clean 502 instead of a vague Next.js crash page. The user sees a
  // toast and can retry; we log the full error server-side for triage.
  try {
  // Reuse an existing Customer if the user has one. Otherwise create
  // one keyed to the user's email + a metadata pointer back to their
  // t2q user_id (so a future Stripe-side audit can correlate without
  // hitting our DB).
  let customerId: string | null = null;
  const { data: existingSub, error: lookupError } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  customerId = existingSub?.stripe_customer_id ?? null;

  if (!customerId) {
    if (!user.email) {
      return NextResponse.json(
        {
          error: "no_email",
          message:
            "Your account has no email address — add one in Settings before subscribing.",
        },
        { status: 400 },
      );
    }
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { t2q_user_id: user.id },
    }, { idempotencyKey: `t2q-customer-${user.id}` });
    customerId = customer.id;

    // Seed the subscriptions row so the webhook has something to update
    // even if checkout completes before the user touches the app again.
    const { error: saveError } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        status: "incomplete",
      },
      { onConflict: "user_id" },
    );
    if (saveError) throw saveError;
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    // success/cancel routes live inside /app so the post-checkout flow
    // is gated by auth — no anonymous landing on success page.
    success_url: `${appUrl}/app?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/app/upgrade?stripe=cancelled`,
    // Send the user_id through so the webhook can find the row even if
    // the customer_id lookup ever drifts.
    metadata: { t2q_user_id: user.id },
    subscription_data: {
      metadata: { t2q_user_id: user.id },
    },
    // Allow upgrades — no need for promo codes in v1 but cheap to enable.
    allow_promotion_codes: true,
  });

  if (!session.url) {
    return NextResponse.json(
      {
        error: "no_session_url",
        message: "Stripe didn't return a checkout URL.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[stripe/checkout] failed", err);
    captureError(err, { route: "/api/stripe/checkout" });
    return NextResponse.json(
      {
        error: "checkout_create_failed",
        message:
          "Could not start checkout — please try again in a moment. If it keeps happening, email support@tradies2quote.com.",
      },
      { status: 502 },
    );
  }
}
