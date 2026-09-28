import "server-only";

import { captureError } from "@/lib/observability";
import { round2 } from "@/lib/quote-defaults";
import { stripeClient } from "@/lib/stripe-client";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Deposit-on-accept payments via Stripe Connect (Express).
 *
 * Completely separate from subscription billing: subscriptions charge the
 * TRADIE (platform customer); these charges are the tradie's CLIENT paying a
 * deposit, with funds settling into the tradie's own connected account (a
 * destination charge, optional platform fee). The subscription webhook is
 * never touched — deposit events flow through /api/payments/webhook with its
 * own signing secret.
 *
 * Flag-gated by PAYMENTS_ENABLED (off by default). Until a tradie has a
 * connected account with charges_enabled, nothing renders and no charge can
 * be created.
 */
export function paymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

/** Optional platform fee, in basis points (100 = 1%). Default 0 (no fee). */
export function platformFeeBps(): number {
  const n = Number(process.env.STRIPE_PLATFORM_FEE_BPS ?? "0");
  return Number.isFinite(n) && n >= 0 && n < 5000 ? Math.floor(n) : 0;
}

/**
 * NZD/AUD/GBP/USD/CAD are all 2-decimal currencies → *100 is correct. The
 * amount goes through the app's exact half-up round2 first, so a half cent
 * can't be lost to float noise (1.005 × 100 = 100.49999999999999).
 */
export function toMinorUnits(amount: number): number {
  return Math.round(round2(Number(amount) || 0) * 100);
}

/**
 * The deposit Stripe charges, in integer cents: the deposit % (clamped to
 * 0–100) of the quote total, rounded half-up like every other money figure.
 * Done in integers — cents × basis points ÷ 10,000 — because the float
 * version put 163,850 × 0.35 at 57,347.49999999999 and rounded an exact half
 * cent ($573.475) DOWN to $573.47.
 */
export function depositCents(total: number, depositPct: number): number {
  const pct = Math.min(100, Math.max(0, Number(depositPct) || 0));
  const cents = toMinorUnits(total);
  if (!(cents > 0) || pct === 0) return 0;
  const basisPoints = Math.round(pct * 100);
  return Math.floor((cents * basisPoints + 5000) / 10000);
}

export type ConnectStatus = {
  connected: boolean;
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
  depositPct: number;
  stripeAccountId: string | null;
};

const DEFAULT_DEPOSIT_PCT = 50;

/** Read connect status from our DB (no Stripe round-trip). */
export async function getConnectStatus(userId: string): Promise<ConnectStatus> {
  const admin = adminClient();
  const { data } = await admin
    .from("payment_accounts")
    .select("stripe_account_id, charges_enabled, details_submitted, deposit_pct")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    connected: Boolean(data?.stripe_account_id),
    chargesEnabled: Boolean(data?.charges_enabled),
    detailsSubmitted: Boolean(data?.details_submitted),
    depositPct: data?.deposit_pct ?? DEFAULT_DEPOSIT_PCT,
    stripeAccountId: data?.stripe_account_id ?? null,
  };
}

/**
 * The profile's country as the ISO 3166-1 code Stripe needs. The app stores
 * the United Kingdom as "UK" (its tax tables and settings use that), which
 * Stripe rejects: it is "GB". Anything that isn't a two-letter code falls
 * back to NZ, as before.
 */
export function stripeCountry(country: string | null | undefined): string {
  const code = (country ?? "").trim().toUpperCase();
  if (code === "UK") return "GB";
  return /^[A-Z]{2}$/.test(code) ? code : "NZ";
}

/** Ensure a connected Express account exists for the user; returns its id. */
export async function ensureConnectedAccount(
  userId: string,
  email: string | null,
  countryIso2: string | null,
): Promise<string> {
  const admin = adminClient();
  const { data: existing, error: readError } = await admin
    .from("payment_accounts")
    .select("stripe_account_id")
    .eq("user_id", userId)
    .maybeSingle();
  // Never guess "no account" from a failed read: that would open a second one.
  if (readError) throw readError;
  if (existing?.stripe_account_id) return existing.stripe_account_id;

  const stripe = stripeClient();
  const country = stripeCountry(countryIso2);
  const account = await stripe.accounts.create(
    {
      type: "express",
      email: email ?? undefined,
      country,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      metadata: { user_id: userId },
    },
    // A retry after a failed save below gets the same account back, not a new one.
    { idempotencyKey: `t2q-connect-account-${userId}-${country}` },
  );

  const { error: saveError } = await admin
    .from("payment_accounts")
    .upsert({ user_id: userId, stripe_account_id: account.id }, { onConflict: "user_id" });
  if (saveError) throw saveError;
  return account.id;
}

/** Pull live charges_enabled / details_submitted from Stripe into our DB. */
export async function refreshConnectStatus(userId: string): Promise<ConnectStatus> {
  const admin = adminClient();
  const { data } = await admin
    .from("payment_accounts")
    .select("stripe_account_id, deposit_pct")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.stripe_account_id) {
    return {
      connected: false,
      chargesEnabled: false,
      detailsSubmitted: false,
      depositPct: DEFAULT_DEPOSIT_PCT,
      stripeAccountId: null,
    };
  }
  const stripe = stripeClient();
  const acct = await stripe.accounts.retrieve(data.stripe_account_id);
  const chargesEnabled = Boolean(acct.charges_enabled);
  const detailsSubmitted = Boolean(acct.details_submitted);
  await admin
    .from("payment_accounts")
    .update({
      charges_enabled: chargesEnabled,
      details_submitted: detailsSubmitted,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return {
    connected: true,
    chargesEnabled,
    detailsSubmitted,
    depositPct: data.deposit_pct ?? DEFAULT_DEPOSIT_PCT,
    stripeAccountId: data.stripe_account_id,
  };
}

/**
 * For the public quote page: should we show a "pay deposit" button for this
 * token, and for how much? Returns null when payments are off or the quote
 * isn't found (or was deleted). `show` is false when the tradie isn't
 * payment-ready or the deposit is already paid. The amount is the one
 * /api/payments/checkout charges: a share of what the client accepted
 * (accepted_total), else the quote total.
 */
export async function getQuoteDepositInfo(
  token: string,
): Promise<{ show: boolean; amountCents: number; currency: string } | null> {
  if (!paymentsEnabled()) return null;
  const admin = adminClient();
  const { data: q } = await admin
    .from("quotes")
    .select("id, user_id, total_amount, accepted_total, currency")
    .eq("public_token", token)
    .is("deleted_at", null)
    .maybeSingle();
  if (!q) return null;

  const currency = q.currency ?? "NZD";
  const status = await getConnectStatus(q.user_id);
  if (!status.chargesEnabled) return { show: false, amountCents: 0, currency };

  const { data: paid } = await admin
    .from("payments")
    .select("id")
    .eq("quote_id", q.id)
    .eq("status", "paid")
    .maybeSingle();

  const cents = depositCents(Number(q.accepted_total ?? q.total_amount ?? 0), status.depositPct);
  return { show: !paid && cents > 0, amountCents: cents, currency };
}

export type SaveDepositResult = { ok: true } | { ok: false; error: string };

/**
 * Persist the tradie's chosen deposit percentage. Says so when nothing was
 * saved — a failed write, or no card-payments account to save it on — so
 * the screen never shows "Saved" for a deposit that wasn't.
 */
export async function setDepositPct(userId: string, pct: number): Promise<SaveDepositResult> {
  const admin = adminClient();
  const clamped = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  const { data, error } = await admin
    .from("payment_accounts")
    .update({ deposit_pct: clamped, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    captureError(error, { route: "settings/deposit" });
    return { ok: false, error: "Couldn't save the deposit. Try again." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Turn on card payments before setting a deposit." };
  }
  return { ok: true };
}
