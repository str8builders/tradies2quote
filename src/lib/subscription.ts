import "server-only";
import { storedPlan, type PlanId } from "./plans";
import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe-client";
import { isOwnerEmail } from "@/lib/owner";
import { isCompedEmail } from "@/lib/reviewer";

/**
 * The single source of truth for "what tier is this user on?"
 *
 * Three states the caller cares about:
 *   - `trialing` — within the free 7-day window after signup
 *   - `paid`    — has an active (or active-until-period-end) Stripe sub
 *   - `expired` — trial is over and no active subscription
 *
 * Used by:
 *   - /app/quotes/new — block if `expired`
 *   - <TrialBanner>  — show warning during last 2 days of trial
 *   - /app/upgrade   — show "you're already subscribed" if `paid`
 *   - Trial email cron — skip expiry emails for `paid`
 *
 * Trial start = `auth.users.created_at` (same anchor the trial-email
 * cron uses, kept consistent across the app). The 7-day trial length
 * is hard-coded — if it ever becomes a per-user value (e.g. extended
 * trials for partners), promote it to a column on profiles.
 */

const TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SubscriptionState = "trialing" | "paid" | "expired";

export interface SubscriptionStatus {
  state: SubscriptionState;
  plan?: PlanId | null;
  managedByTeam?: boolean;
  /** When the trial ends (or ended). Always populated, even if user is
   *  on a paid plan — useful for "trial converted on day X" analytics. */
  trialEndsAt: Date;
  /** Days remaining in the trial. Negative if expired. Null if `paid`. */
  trialDaysLeft: number | null;
  /** When the paid subscription period ends. Only present if `paid`. */
  currentPeriodEnd: Date | null;
  /** Stripe customer id. Only present if user has ever started checkout. */
  stripeCustomerId: string | null;
  /** Raw Stripe status string ("active", "trialing", "past_due", etc).
   *  null when user has never started a subscription. */
  stripeSubscriptionStatus: string | null;
  /** If a project-wide free beta window is active (BETA_FREE_UNTIL env
   *  var set to a future ISO date), this is the date it ends. Tradies
   *  see a banner "Beta — free until <date>" until that timestamp. */
  betaFreeUntil: Date | null;
}

/**
 * Read the user's status. Single Supabase round-trip — pulls auth user
 * created_at AND any subscriptions row in one query path.
 *
 * `signedUpAt` is the trial anchor (auth.users.created_at). The caller
 * usually has the user object already; pass it in to save a round-trip.
 */
export async function getSubscriptionStatus(args: {
  userId: string;
  signedUpAt: Date;
  /** The auth user's email. Used purely to short-circuit the paywall
   *  for the project owner — see isOwnerEmail. Optional so older
   *  callers that don't pass it fall back to normal billing rules. */
  email?: string | null;
}): Promise<SubscriptionStatus> {
  const { userId, signedUpAt, email } = args;
  const now = new Date();

  // BETA_FREE_UNTIL — temporary free-for-all window. Lets the operator
  // invite mates to test without anyone tripping the paywall, and self-
  // expires when the date passes so the paywall comes back without a
  // manual flip. ISO date string (e.g. "2026-06-01" or full ISO).
  // Invalid / past dates fall through silently to normal billing rules.
  const betaFreeUntilRaw = process.env.BETA_FREE_UNTIL;
  const betaFreeUntil =
    betaFreeUntilRaw && !Number.isNaN(Date.parse(betaFreeUntilRaw))
      ? new Date(betaFreeUntilRaw)
      : null;
  const betaActive = betaFreeUntil !== null && now < betaFreeUntil;

  // Provisional trial dates using signedUpAt as the anchor. Used by
  // the owner-bypass + beta-active early returns where the trial
  // state is overridden anyway. The non-bypass path below re-derives
  // these from profiles.trial_started_at if set.
  const provisionalTrialEndsAt = new Date(
    signedUpAt.getTime() + TRIAL_DAYS * DAY_MS,
  );

  // Project owner never gets billed. Reports as "paid" so the trial
  // banner stays hidden, the upgrade page redirects them out, and the
  // /app/quotes/new gate never blocks. Cheaper than wiring a hard-coded
  // Stripe subscription for the operator's account.
  if (isOwnerEmail(email)) {
    return {
      state: "paid",
      trialEndsAt: provisionalTrialEndsAt,
      trialDaysLeft: null,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionStatus: "owner_bypass",
      betaFreeUntil: betaActive ? betaFreeUntil : null,
    };
  }

  // App Store review accounts are comped IN CODE (not via a fragile
  // hand-inserted subscriptions row with a live expiry) so the reviewer can
  // always exercise the core voice-to-quote flow — see src/lib/reviewer.ts.
  // Deliberately NOT isOwnerEmail: reviewers must never see owner-only
  // surfaces (/app/agents, /app/debug).
  if (isCompedEmail(email)) {
    return {
      state: "paid",
      trialEndsAt: provisionalTrialEndsAt,
      trialDaysLeft: null,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionStatus: "review_comp",
      betaFreeUntil: betaActive ? betaFreeUntil : null,
    };
  }

  // Beta window applies to everyone else too — treat them as paid so
  // there's no friction during invite-mates testing.
  if (betaActive) {
    return {
      state: "paid",
      trialEndsAt: provisionalTrialEndsAt,
      trialDaysLeft: null,
      currentPeriodEnd: betaFreeUntil,
      stripeCustomerId: null,
      stripeSubscriptionStatus: "beta_free",
      betaFreeUntil,
    };
  }

  // Wave 39 — fetch profiles.trial_started_at (the override anchor for
  // restarted/extended trials) AND the subscriptions row in parallel.
  // When trial_started_at is present, it wins over the immutable
  // auth.users.created_at; that's how the bulk-restart script
  // (supabase/scripts/restart_all_trials.sql) gives every existing
  // user a fresh 7-day window without recreating their auth rows.
  const admin = adminClient();
  let billingUserId = userId;
  if (isStripeConfigured()) {
    const result = await admin.rpc("active_team_owner" as never, { p_user: userId } as never);
    if (result.error) throw result.error;
    billingUserId = (result.data as string | null) ?? userId;
  }
  // `trial_started_at` is the Wave 39 column added by
  // supabase/migrations/20260519_trial_started_at.sql. Generated
  // Supabase types don't include it until you regenerate via
  // `supabase gen types typescript --linked > ...`, so the read goes
  // through `as never` and the result is narrowed manually. Re-running
  // type generation after the migration is applied will let us drop
  // the cast.
  const [profileRes, subRes] = await Promise.all([
    admin
      .from("profiles")
      .select("trial_started_at" as never)
      .eq("id", userId)
      .maybeSingle(),
    isStripeConfigured()
      ? admin
          .from("subscriptions")
          .select(
            "stripe_customer_id, stripe_subscription_id, status, current_period_end, plan",
          )
          .eq("user_id", billingUserId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  if (profileRes.error) throw profileRes.error;
  if (subRes.error) throw subRes.error;

  // Derive the real trial anchor.
  const profileRow = profileRes.data as {
    trial_started_at: string | null;
  } | null;
  const trialAnchor = profileRow?.trial_started_at
    ? new Date(profileRow.trial_started_at)
    : signedUpAt;
  const trialEndsAt = new Date(trialAnchor.getTime() + TRIAL_DAYS * DAY_MS);
  const trialMsLeft = trialEndsAt.getTime() - now.getTime();
  const trialDaysLeft = Math.ceil(trialMsLeft / DAY_MS);
  const inTrial = trialMsLeft > 0;

  // No Stripe configured = everyone is on a permanent trial. Lets the
  // app run end-to-end during development before keys are wired. We
  // still respect the trial_started_at anchor in dev so test users
  // can experience the trial-expired UI by setting the anchor back.
  if (!isStripeConfigured()) {
    return {
      state: inTrial ? "trialing" : "trialing",
      trialEndsAt,
      trialDaysLeft: inTrial ? trialDaysLeft : 0,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionStatus: null,
      betaFreeUntil: null,
    };
  }

  const sub = subRes.data;

  const subStatus = sub?.status ?? null;
  const periodEnd = sub?.current_period_end
    ? new Date(sub.current_period_end)
    : null;

  // Stripe statuses that mean "user has access right now":
  //   - active   : paying normally
  //   - trialing : Stripe-managed trial (we don't use this — we manage
  //     trial ourselves — but treat it as paid if it ever appears)
  //   - past_due : retry-in-progress; let them in for now, the retry
  //     either succeeds or cancels the subscription
  // Everything else (canceled, unpaid, incomplete, incomplete_expired,
  // paused) loses access immediately.
  const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
  const hasActiveSub =
    subStatus !== null &&
    ACTIVE_STATUSES.has(subStatus) &&
    // If the period has ended and Stripe hasn't bumped us yet, treat
    // as expired so the user can't slip through a webhook delay.
    periodEnd !== null && periodEnd.getTime() > now.getTime() && storedPlan(sub?.plan) !== null;

  if (hasActiveSub) {
    return {
      state: "paid",
      trialEndsAt,
      trialDaysLeft: null,
      currentPeriodEnd: periodEnd,
      plan: storedPlan(sub?.plan),
      managedByTeam: billingUserId !== userId,
      stripeCustomerId: billingUserId === userId ? sub?.stripe_customer_id ?? null : null,
      stripeSubscriptionStatus: subStatus,
      betaFreeUntil: null,
    };
  }

  return {
    state: inTrial ? "trialing" : "expired",
    trialEndsAt,
    trialDaysLeft,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: sub?.stripe_customer_id ?? null,
    stripeSubscriptionStatus: subStatus,
    betaFreeUntil: null,
  };
}

/**
 * Request-scoped cache for server components that need the same billing
 * answer during one render. `/app/quotes/new` and `<TrialBanner>` both ask
 * this question on the New Quote route, so primitive args let React dedupe
 * the admin reads without changing the public `getSubscriptionStatus` API.
 */
export const getCachedSubscriptionStatus = cache(
  async (
    userId: string,
    signedUpAtISO: string | null,
    email?: string | null,
  ): Promise<SubscriptionStatus> => {
    return getSubscriptionStatus({
      userId,
      signedUpAt: signedUpAtISO ? new Date(signedUpAtISO) : new Date(),
      email,
    });
  },
);

/** Convenience: can the user create new quotes / use write features? */
export function canWrite(status: SubscriptionStatus): boolean {
  return status.state !== "expired";
}

/** Convenience: should we show the "your trial ends soon" banner? */
export function shouldShowTrialBanner(status: SubscriptionStatus): boolean {
  return (
    status.state === "trialing" &&
    status.trialDaysLeft !== null &&
    status.trialDaysLeft <= 2
  );
}
