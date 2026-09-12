import type Stripe from "stripe";
import { type PlanId } from "./plans";
/** Return no entitlement for a foreign, mixed or incorrectly quantified subscription. */
export function subscriptionPlan(subscription: Stripe.Subscription, lookup: (priceId: string) => PlanId | null): PlanId | null {
  const items=subscription.items.data;
  if(items.length!==1 || items[0].quantity!==1) return null;
  return lookup(items[0].price.id);
}
