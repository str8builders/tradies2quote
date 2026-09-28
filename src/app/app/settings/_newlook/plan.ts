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
  /** Stripe's own status for the subscription, when there is one. */
  stripeSubscriptionStatus?: string | null;
  /** Last moment of the free beta, while it runs (and the tradie has no paid plan). */
  betaFreeUntil?: Date | null;
}

/** manage: open Stripe's billing page. choose: go to /app/upgrade. */
export type PlanAction = "manage" | "choose";

export interface PlanSummary {
  pill: { tone: "ok" | "info" | "bad"; label: string };
  title: string;
  detail: string;
  /** The buttons to show, in order. */
  actions: PlanAction[];
  /** Said instead of a button when checkout isn't set up on this server. */
  note: string | null;
}

/** Stripe is still trying to collect (or waiting on) a payment for these. */
const PAYMENT_PROBLEM = new Set(["past_due", "unpaid", "incomplete", "paused"]);

/** Same date style as the old panel ("12 Oct 2026"). */
export function formatPlanDate(date: Date): string {
  return date.toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Whether the tradie can open Stripe's billing page: whenever they have their
 * own Stripe customer, whatever the plan state. A lapsed, unpaid, paused or
 * incomplete subscription (or one the app thinks has run out) is still billed
 * by Stripe, so cancelling or fixing the card must always be one tap away.
 */
export function canManageBilling(status: PlanStatus): boolean {
  return Boolean(status.stripeCustomerId) && !status.managedByTeam;
}

export function planSummary(status: PlanStatus, stripeConfigured: boolean): PlanSummary {
  const manage = canManageBilling(status);
  const paymentProblem = manage && PAYMENT_PROBLEM.has(status.stripeSubscriptionStatus ?? "");
  const problemLine = "Your subscription has a payment problem. Fix it or cancel in Manage billing.";

  if (status.state === "paid") {
    const plan = status.plan ? PLANS[status.plan] : null;
    let detail: string;
    if (status.managedByTeam) detail = "Your team owner looks after billing.";
    else if (plan) {
      const paidUpTo = status.currentPeriodEnd
        ? ` Paid up to ${formatPlanDate(status.currentPeriodEnd)}.`
        : "";
      detail = `$${plan.price} NZD a month.${paidUpTo}`;
    } else if (status.betaFreeUntil) {
      detail = `Free access until ${formatPlanDate(status.betaFreeUntil)}.${paymentProblem ? ` ${problemLine}` : ""}`;
    } else detail = "Your account has free access.";
    return {
      pill: { tone: "ok", label: "Active" },
      title: plan ? `Tradies2Quote ${plan.name}` : "Tradies2Quote",
      detail,
      actions: manage ? ["manage"] : [],
      note: null,
    };
  }

  if (status.managedByTeam) {
    // Checkout refuses team members: their owner's plan covers them.
    return {
      pill: { tone: "bad", label: "Team plan" },
      title: "Your team's plan needs attention",
      detail: "Your team owner looks after billing. Ask them to check the team's plan.",
      actions: [],
      note: null,
    };
  }

  const choose: PlanAction[] = stripeConfigured ? ["choose"] : [];
  // A payment problem is fixed in Stripe, so that button comes first.
  const actions: PlanAction[] = !manage ? choose : paymentProblem ? ["manage", ...choose] : [...choose, "manage"];
  const note = stripeConfigured ? null : "Plans can't be bought here just yet.";
  if (status.state === "expired") {
    if (paymentProblem) {
      return {
        pill: { tone: "bad", label: "Payment problem" },
        title: "Your subscription isn't paid up",
        detail: "You can still open and send the quotes you have. Update your card in Manage billing to make new ones.",
        actions,
        note,
      };
    }
    const hadPlan = Boolean(status.stripeSubscriptionStatus);
    return {
      pill: { tone: "bad", label: hadPlan ? "Plan ended" : "Trial ended" },
      title: hadPlan ? "Your plan has ended" : "Your free trial has ended",
      detail: "You can still open and send the quotes you have. Choose a plan to make new ones.",
      actions,
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
    detail: `Your trial ends ${formatPlanDate(status.trialEndsAt)}. Choose a plan to keep making quotes after that.${paymentProblem ? ` ${problemLine}` : ""}`,
    actions,
    note,
  };
}
