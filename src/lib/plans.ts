/** Public plan catalogue: amounts are NZD, GST inclusive, monthly. */
export const PLANS = {
  solo: { id: "solo", name: "Solo", price: 49, seats: 1, tag: "For your own business", features: ["Unlimited quotes & invoices", "1 user account", "Branded PDF + email", "Client list", "Email support"] },
  crew: { id: "crew", name: "Crew", price: 79, seats: 5, tag: "For a small team", features: ["Everything in Solo", "Up to 5 users, including you", "Shared client list", "Quote photo attachments", "Priority support"] },
  builder: { id: "builder", name: "Builder", price: 199, seats: 20, tag: "For a growing business", features: ["Everything in Crew", "Up to 20 users, including you", "Reusable terms templates", "Dedicated success support"] },
} as const;
export type PlanId = keyof typeof PLANS;
export function isPlanId(value: unknown): value is PlanId { return typeof value === "string" && Object.hasOwn(PLANS, value); }
export function storedPlan(value: unknown): PlanId | null { return value === "pro_monthly" ? "solo" : isPlanId(value) ? value : null; }
