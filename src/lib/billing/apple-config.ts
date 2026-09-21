import "server-only";
import { isPlanId, type PlanId } from "@/lib/plans";
export const APPLE_BUNDLE_ID = "com.str8builders.tradies2quote";

export function appleProductPlans(): Record<string, PlanId> {
  const raw: unknown = JSON.parse(process.env.APPLE_PRODUCT_PLANS_JSON || "{}");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid Apple product configuration");
  const result: Record<string, PlanId> = {};
  for (const [id, plan] of Object.entries(raw)) {
    if (!id.startsWith(`${APPLE_BUNDLE_ID}.`) || !isPlanId(plan)) throw new Error("Invalid Apple product mapping");
    result[id] = plan;
  }
  return result;
}
export function appleSubscriptionsReady(): boolean {
  try {
    return process.env.APPLE_SUBSCRIPTIONS_ENABLED === "true" && Object.keys(appleProductPlans()).length > 0
      && ["APPLE_IAP_PRIVATE_KEY", "APPLE_IAP_KEY_ID", "APPLE_ISSUER_ID", "APPLE_APP_ID"].every(key => Boolean(process.env[key]?.trim()))
      && /^\d+$/.test(process.env.APPLE_APP_ID ?? "");
  } catch { return false; }
}
