import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getPlanPriceId, isStripeConfigured, stripeClient } from "@/lib/stripe-client";
import { isPlanId, PLANS } from "@/lib/plans";
import { consumeFixedWindow } from "@/lib/rate-limit";
import { isNativeShellRequest } from "@/lib/native-shell";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  if (await isNativeShellRequest()) return NextResponse.json({ error: "unavailable" }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const plan = input?.plan ?? "solo";
  if (!isPlanId(plan)) return NextResponse.json({ message: "Choose one of the available plans." }, { status: 400 });
  if (!isStripeConfigured() || !getPlanPriceId(plan) || (plan !== "solo" && process.env.TEAM_PLANS_ENABLED !== "true")) return NextResponse.json({ message: "This plan is not open for purchases yet. Please try again shortly." }, { status: 503 });
  if (!consumeFixedWindow(`checkout:${user.id}`, 10, 60_000).ok) return NextResponse.json({ message: "Please wait a minute before trying again." }, { status: 429 });
  let checkoutKey: string | null = null;
  try {
    const admin = adminClient();
    const stripe = stripeClient();
    const { data: teamOwner, error: teamError } = await db.rpc("my_team_owner");
    if (teamError) throw teamError;
    if (teamOwner && teamOwner !== user.id) return NextResponse.json({ message: "Your team owner manages your subscription." }, { status: 409 });
    // A DB lease gives simultaneous clicks the same idempotency key, across all plans.
    const { data: lease, error: leaseError } = await db.rpc("claim_checkout", { p_plan: plan });
    if (leaseError) return NextResponse.json({ message: leaseError.message }, { status: 409 });
    const checkout = lease as { key: string; plan: string; created_at: string };
    checkoutKey = checkout.key;
    const { data: existing, error } = await admin.from("subscriptions").select("stripe_customer_id,stripe_subscription_id,status").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    let customerId = existing?.stripe_customer_id ?? null;
    if (customerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      if (subscriptions.data.some((s) => s.metadata.t2q_user_id === user.id && !["canceled", "incomplete_expired"].includes(s.status))) {
        return NextResponse.json({ message: "You already have a subscription. Use Manage subscription to change your plan.", manage: true }, { status: 409 });
      }
    }
    const priceId = getPlanPriceId(plan)!;
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || !price.livemode && process.env.NODE_ENV === "production" || price.tax_behavior !== "inclusive" || price.currency !== "nzd" || price.unit_amount !== PLANS[plan].price * 100 || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) throw new Error("Configured Stripe price does not match the published plan.");
    if (!customerId) {
      if (!user.email) return NextResponse.json({ message: "Add an email to your account before subscribing." }, { status: 400 });
      const customer = await stripe.customers.create({ email: user.email, metadata: { t2q_user_id: user.id } }, { idempotencyKey: `t2q-customer-${user.id}` });
      customerId = customer.id;
      const save = await admin.from("subscriptions").upsert({ user_id: user.id, stripe_customer_id: customerId, status: "incomplete" }, { onConflict: "user_id" });
      if (save.error) throw save.error;
    }
    const existingSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
    const ownSessions = existingSessions.data.filter((s) => s.metadata?.t2q_user_id === user.id);
    if (ownSessions.length > 5) throw new Error("Too many open checkout sessions.");
    for (const open of ownSessions) {
      if (open.metadata?.t2q_user_id === user.id) {
        if (open.metadata?.t2q_checkout_key === checkout.key && open.url) return NextResponse.json({ ok: true, url: open.url });
        await stripe.checkout.sessions.expire(open.id);
      }
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: customerId, line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/app/upgrade?stripe=success`, cancel_url: `${appUrl}/app/upgrade?stripe=cancelled&plan=${plan}`,
      metadata: { t2q_user_id: user.id, t2q_plan: plan, t2q_checkout_key: checkout.key },
      subscription_data: { metadata: { t2q_user_id: user.id, t2q_plan: plan } },
      allow_promotion_codes: true,
      expires_at: Math.floor(Date.parse(checkout.created_at) / 1000) + 3600,
    }, { idempotencyKey: `t2q-checkout-${checkout.key}` });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    captureError(error, { route: "/api/stripe/checkout" });
    return NextResponse.json({ message: "Checkout could not open. Please try again shortly." }, { status: 502 });
  } finally {
    if (checkoutKey) {
      const released = await db.rpc("finish_checkout", { p_key: checkoutKey });
      if (released.error) captureError(released.error, { route: "/api/stripe/checkout" });
    }
  }
}
