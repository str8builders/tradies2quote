/**
 * New-look settings: "Your Tradies2Quote plan" in plain words, from the same
 * subscription status the old SubscriptionPanel reads. Pure, tested in node.
 * The Payments page renders it only outside the iOS app (3.1.3(f)).
 */

import { PLANS, type PlanId } from "@/lib/plans";

/** The fields of SubscriptionStatus the card needs (the type lives in a server-only module). */
export interface PlanStatus {
  state: "trialing" | "paid" | "expired";
  plan?: PlanId | null;
  managedByTeam?: boolean;
  trialEndsAt: Date;
  trialDaysLeft: number | null;
  currentPeriodEnd: Date | null;
  stripeCustomerId: string | null;
}

export interface PlanSummary {
  pill: { tone: "ok" | "info" | "bad"; label: string };
  title: string;
  detail: string;
  /** manage: open Stripe's billing page. choose: go to /app/upgrade. */
  action: "manage" | "choose" | null;
  /** Said instead of a button when checkout isn't set up on this server. */
  note: string | null;
}

/** Same date style as the old panel ("12 Oct 2026"). */
export function formatPlanDate(date: Date): string {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

export function planSummary(status: PlanStatus, stripeConfigured: boolean): PlanSummary {
  if (status.state === "paid") {
    const plan = status.plan ? PLANS[status.plan] : null;
    let detail: string;
    if (status.managedByTeam) detail = "Your team owner looks after billing.";
    else if (plan) {
      const paidUpTo = status.currentPeriodEnd
        ? ` Paid up to ${formatPlanDate(status.currentPeriodEnd)}.`
        : "";
      detail = `$${plan.price} NZD a month.${paidUpTo}`;
    } else detail = "Your account has free access.";
    return {
      pill: { tone: "ok", label: "Active" },
      title: plan ? `Tradies2Quote ${plan.name}` : "Tradies2Quote",
      detail,
      action: status.stripeCustomerId && !status.managedByTeam ? "manage" : null,
      note: null,
    };
  }

  const choose = stripeConfigured ? ("choose" as const) : null;
  const note = stripeConfigured ? null : "Plans can't be bought here just yet.";
  if (status.state === "expired") {
    return {
      pill: { tone: "bad", label: "Trial ended" },
      title: "Your free trial has ended",
      detail: "You can still open and send the quotes you have. Choose a plan to make new ones.",
      action: choose,
      note,
    };
  }

  const daysLeft = Math.max(0, status.trialDaysLeft ?? 0);
  return {
    pill: { tone: "info", label: "Free trial" },
    title:
      daysLeft <= 1
        ? "Last day of your free trial"
        : `${daysLeft} days left in your free trial`,
    detail: `Your trial ends ${formatPlanDate(status.trialEndsAt)}. Choose a plan to keep making quotes after that.`,
    action: choose,
    note,
  };
}
