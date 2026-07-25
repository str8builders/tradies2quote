import "server-only";
import Stripe from "stripe";

/**
 * Server-only Stripe SDK init.
 *
 * Throws synchronously if STRIPE_SECRET_KEY isn't set, so callers MUST
 * be inside a route/action that has already short-circuited on the
 * env-missing case. The thin `tryStripe()` helper below returns null
 * when the key is missing, for callers that want to gracefully degrade
 * (e.g. health checks, gating logic that defaults "allow").
 *
 * `apiVersion` is pinned so an upstream Stripe API bump can't silently
 * change response shapes under us. Bump it deliberately when migrating.
 */
let cached: Stripe | null = null;

export function stripeClient(): Stripe {
  if (cached) return cached;
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  cached = new Stripe(secret, {
    apiVersion: "2026-06-24.dahlia",
    // The SDK auto-reads STRIPE_SECRET_KEY but we pass it explicitly so
    // env-injection mistakes fail loudly here instead of mid-checkout.
    typescript: true,
  });
  return cached;
}

/** Returns the Stripe client, or null if STRIPE_SECRET_KEY is missing.
 *  Use this from health checks / gating helpers that should treat
 *  "no Stripe configured" as a non-fatal state. */
export function tryStripe(): Stripe | null {
  try {
    return stripeClient();
  } catch {
    return null;
  }
}

/**
 * Is Stripe configured at all? Cheap presence check used by gating
 * logic — if the env vars aren't set we behave as if every user is on
 * a permanent trial (because we can't actually charge them anyway).
 */
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_ID,
  );
}

/** The single recurring price (NZD $49/mo). Defined as a Stripe Price
 *  in the dashboard and referenced by id via env var so we don't have
 *  to redeploy to change pricing. */
export function getPlanPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID ?? null;
}
