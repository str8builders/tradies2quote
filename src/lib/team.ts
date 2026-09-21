import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { storedPlan, PLANS, type PlanId } from "@/lib/plans";

export const getTeamContext = cache(async (userId: string) => {
  const db = await createClient();
  const { data: membership, error: memberError } = await db.from("team_members").select("team_id").eq("user_id", userId).maybeSingle();
  if (memberError) throw memberError;
  let team: { id: string; name: string; owner_id: string } | null = null;
  if (membership) {
    const result = await db.from("teams").select("id,name,owner_id").eq("id", membership.team_id).maybeSingle();
    if (result.error) throw result.error;
    team = result.data;
  }
  const ownerId = team?.owner_id ?? userId;
  const { data: sub, error } = await adminClient().from("subscriptions").select("plan,status,current_period_end").eq("user_id", ownerId).maybeSingle();
  if (error) throw error;
  let plan = storedPlan(sub?.plan);
  let paid = !!(plan && sub && ["active", "trialing", "past_due"].includes(sub.status ?? "") && sub.current_period_end && Date.parse(sub.current_period_end) > Date.now());
  if (process.env.APPLE_SUBSCRIPTIONS_ENABLED === "true") {
    const result = await adminClient().rpc("effective_subscription" as never, { p_user: ownerId } as never);
    if (result.error) throw result.error;
    const effective = result.data as { plan: string; expiresAt: string } | null;
    if (effective && storedPlan(effective.plan) && Date.parse(effective.expiresAt) > Date.now()) {
      plan = storedPlan(effective.plan); paid = true;
    }
  }
  const { data: activeOwner, error: activeError } = await db.rpc("my_team_owner");
  if (activeError) throw activeError;
  const effectivePlan: PlanId = paid && (!team || ownerId === userId || activeOwner === ownerId) ? plan! : "solo";
  return { team, ownerId, isOwner: ownerId === userId, active: effectivePlan !== "solo", plan: effectivePlan, seats: PLANS[effectivePlan].seats, clientOwnerId: (activeOwner as string | null) ?? userId };
});
