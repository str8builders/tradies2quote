import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe-client";
import {
  depositCents,
  getConnectStatus,
  paymentsEnabled,
  platformFeeBps,
} from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED_LIKE = new Set(["accepted", "scheduled", "in_progress", "completed"]);

/**
 * POST /api/payments/checkout  { token }
 * Public — called from the public quote page by the client. Validates the
 * quote via its public token (no auth), then creates a Stripe Checkout
 * Session for the deposit as a DESTINATION charge into the tradie's connected
 * account (optional platform fee). A pending `payments` row is written first
 * so the webhook can mark it paid by id.
 */
export async function POST(request: NextRequest) {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }

  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = String(body?.token ?? "").trim();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  try {
    const admin = adminClient();
    const { data: q } = await admin
      .from("quotes")
      .select("id, user_id, total_amount, currency, status")
      .eq("public_token", token)
      .maybeSingle();
    if (!q) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (!ACCEPTED_LIKE.has(q.status)) {
      return NextResponse.json({ error: "not_acceptable_yet" }, { status: 409 });
    }

    const status = await getConnectStatus(q.user_id);
    if (!status.chargesEnabled || !status.stripeAccountId) {
      return NextResponse.json({ error: "payments_unavailable" }, { status: 409 });
    }

    const { data: alreadyPaid } = await admin
      .from("payments")
      .select("id")
      .eq("quote_id", q.id)
      .eq("status", "paid")
      .maybeSingle();
    if (alreadyPaid) return NextResponse.json({ error: "already_paid" }, { status: 409 });

    const cents = depositCents(Number(q.total_amount ?? 0), status.depositPct);
    if (cents <= 0) return NextResponse.json({ error: "no_deposit" }, { status: 409 });

    const currencyUpper = q.currency ?? "NZD";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";

    // Only one payable session per quote: expire any earlier pending
    // sessions (second tab, re-opened link) so the customer can never
    // hold two live checkout links and pay the deposit twice.
    const { data: stale } = await admin
      .from("payments")
      .select("id, stripe_checkout_session_id")
      .eq("quote_id", q.id)
      .eq("status", "pending")
      .not("stripe_checkout_session_id", "is", null);
    if (stale && stale.length > 0) {
      const stripeForExpiry = stripeClient();
      for (const p of stale) {
        try {
          await stripeForExpiry.checkout.sessions.expire(
            p.stripe_checkout_session_id as string,
          );
        } catch {
          // Already expired or completed — nothing to do.
        }
        await admin
          .from("payments")
          .update({ status: "expired" })
          .eq("id", p.id)
          .eq("status", "pending");
      }
    }

    // Seed a pending payment row so the webhook can resolve it by id.
    const { data: payRow, error: payErr } = await admin
      .from("payments")
      .insert({
        user_id: q.user_id,
        quote_id: q.id,
        amount_cents: cents,
        currency: currencyUpper,
        status: "pending",
      })
      .select("id")
      .single();
    if (payErr || !payRow) {
      return NextResponse.json({ error: "could_not_start" }, { status: 500 });
    }

    const stripe = stripeClient();
    const feeCents = Math.floor((cents * platformFeeBps()) / 10000);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: currencyUpper.toLowerCase(),
            product_data: { name: "Deposit for your quote" },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        ...(feeCents > 0 ? { application_fee_amount: feeCents } : {}),
        transfer_data: { destination: status.stripeAccountId },
      },
      success_url: `${appUrl}/quote/${token}?paid=1`,
      cancel_url: `${appUrl}/quote/${token}`,
      metadata: { payment_id: payRow.id, quote_id: q.id, user_id: q.user_id },
    });

    await admin
      .from("payments")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", payRow.id);

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("[payments/checkout] failed", e);
    captureError(e, { route: "/api/payments/checkout" });
    // Public endpoint — never echo internals (Stripe/Supabase error text
    // can name account ids and config). Detail lives in captureError/logs.
    return NextResponse.json(
      { error: "checkout_failed", message: "Could not start the payment. Please try again." },
      { status: 500 },
    );
  }
}
