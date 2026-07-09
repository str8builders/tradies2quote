import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripeClient } from "@/lib/stripe-client";
import { ensureConnectedAccount, paymentsEnabled } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/connect
 * Tradie-only. Ensures a Stripe Connect (Express) account exists for the
 * signed-in tradie, then returns a one-time onboarding link to finish setup.
 * The settings UI redirects the browser to the returned URL.
 */
export async function POST() {
  if (!paymentsEnabled()) {
    return NextResponse.json({ error: "disabled" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("email, country")
      .eq("id", user.id)
      .maybeSingle();

    const accountId = await ensureConnectedAccount(
      user.id,
      profile?.email ?? user.email ?? null,
      profile?.country ?? null,
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
    const stripe = stripeClient();
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/app/settings?stripe=return`,
      return_url: `${appUrl}/app/settings?stripe=return`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: link.url });
  } catch (e) {
    console.error("[payments/connect] failed", e);
    return NextResponse.json(
      { error: "connect_failed", message: "Could not start Stripe onboarding. Please try again." },
      { status: 500 },
    );
  }
}
