import type Stripe from "stripe";
import { type PlanId } from "./plans";
/** Return no entitlement for a foreign, mixed or incorrectly quantified subscription. */
export function subscriptionPlan(subscription: Stripe.Subscription, lookup: (priceId: string) => PlanId | null): PlanId | null {
  const items=subscription.items.data;
  if(items.length!==1 || items[0].quantity!==1) return null;
  return lookup(items[0].price.id);
}

/** Stripe can still charge (or start charging) a subscription in these states. */
export function isLiveSubscriptionStatus(status: string | null | undefined): boolean {
  return typeof status === "string" && status !== "canceled" && status !== "incomplete_expired";
}

/**
 * sync_stripe_subscription's answer when no subscriptions row holds the
 * customer: the account was deleted (its row with it), or the customer was
 * made outside the app's checkout.
 */
export function isUnmappedCustomerError(error: { message?: string } | null | undefined): boolean {
  return /customer is not mapped/i.test(error?.message ?? "");
}
