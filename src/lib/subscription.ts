import "server-only";
import { storedPlan, type PlanId } from "./plans";
import { cache } from "react";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe-client";
import { isOwnerEmail } from "@/lib/owner";
import { isCompedEmail } from "@/lib/reviewer";
import { captureError } from "@/lib/observability";

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

/** BETA_FREE_UNTIL dates are New Zealand dates: the business and most tradies are there. */
export const BETA_TIME_ZONE = "Pacific/Auckland";

/** Offset of `timeZone` from UTC at `instant` (whole-second instants), in ms. */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - instant;
}

/** The UTC instant of 00:00 on y-m-d (day may overflow the month) in `timeZone`. */
function zonedMidnight(y: number, m: number, d: number, timeZone: string): number {
  const wall = Date.UTC(y, m - 1, d);
  const guess = wall - zoneOffsetMs(wall, timeZone);
  // A second pass settles a daylight-saving change between the guess and the answer.
  return wall - zoneOffsetMs(guess, timeZone);
}

/**
 * BETA_FREE_UNTIL as the LAST moment of free access.
 *
 * A plain date ("2026-10-31") means the whole of that day in New Zealand:
 * free until 23:59:59.999 NZ time. `new Date("2026-10-31")` is UTC midnight,
 * which ended the beta at 1 pm NZDT on the 31st. A full ISO timestamp is
 * taken as the exact instant. Anything unparseable (or an impossible date
 * like 2026-02-31) is ignored, so normal billing rules apply.
 */
export function parseBetaFreeUntil(raw: string | null | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [y, m, d] = [Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3])];
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) {
      return null;
    }
    return new Date(zonedMidnight(y, m, d + 1, BETA_TIME_ZONE) - 1);
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms);
}

/**
 * When a tradie's 7-day trial starts. Everyone who joined during the free
 * beta starts their trial when the beta ends, not when they signed up, so
 * the end of the beta never locks anyone out at once: each beta user gets
 * the same 7 days (and the same reminder emails) a new sign-up would.
 * BETA_FREE_UNTIL therefore stays set after the beta has ended.
 */
export function betaTrialAnchor(anchor: Date, betaFreeUntil: Date | null): Date {
  return betaFreeUntil && betaFreeUntil.getTime() > anchor.getTime() ? betaFreeUntil : anchor;
}

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
  /**
   * The user's OWN Stripe customer id, whenever they have ever started
   * checkout — in every state, including the beta, a trial or an expired
   * account. It is what shows "Manage billing": a lapsed, unpaid, paused or
   * incomplete subscription (or one whose stored period end is stale) still
   * needs a way to update the card or cancel. Null for team members (their
   * owner manages billing) and for owner / review accounts.
   */
  stripeCustomerId: string | null;
  /** Raw Stripe status string ("active", "trialing", "past_due", etc).
   *  null when user has never started a subscription. */
  stripeSubscriptionStatus: string | null;
  /** If a project-wide free beta window is active (BETA_FREE_UNTIL env
   *  var set to a future date), the last moment of free access. Tradies
   *  without a paid plan see "Free access until <date>" until then. Null
   *  for tradies who pay for a plan: their subscription is what counts. */
  betaFreeUntil: Date | null;
}

type SubscriptionRow = {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  current_period_end: string | null;
  plan: string | null;
};

/** Everything the status needs from the database, read in one go. */
async function readBilling(
  userId: string,
  stripeConfigured: boolean,
): Promise<{ trialStartedAt: string | null; sub: SubscriptionRow | null; billingUserId: string }> {
  // Wave 39 — fetch profiles.trial_started_at (the override anchor for
  // restarted/extended trials) AND the subscriptions row in parallel.
  // When trial_started_at is present, it wins over the immutable
  // auth.users.created_at; that's how the bulk-restart script
  // (supabase/scripts/restart_all_trials.sql) gives every existing
  // user a fresh 7-day window without recreating their auth rows.
  const admin = adminClient();
  let billingUserId = userId;
  if (stripeConfigured) {
    const result = await admin.rpc("active_team_owner" as never, { p_user: userId } as never);
    if (result.error) throw result.error;
    billingUserId = (result.data as string | null) ?? userId;
  }
  // `trial_started_at` is the Wave 39 column added by
  // supabase/migrations/20260519_trial_started_at.sql. Generated
  // Supabase types don't include it until you regenerate via
  // `supabase gen types typescript --linked > ...`, so the read goes
  // through `as never` and the result is narrowed manually.
  const [profileRes, subRes] = await Promise.all([
    admin
      .from("profiles")
      .select("trial_started_at" as never)
      .eq("id", userId)
      .maybeSingle(),
    stripeConfigured
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
  const profileRow = profileRes.data as { trial_started_at: string | null } | null;
  return {
    trialStartedAt: profileRow?.trial_started_at ?? null,
    sub: (subRes.data as SubscriptionRow | null) ?? null,
    billingUserId,
  };
}

/**
 * Read the user's status: the owner / review-account bypasses first, then
 * the database (trial anchor, team owner and subscription row), then the
 * beta window.
 *
 * The subscription is read BEFORE the beta decides anything: during the free
 * beta a paying subscriber is still being charged by Stripe, so they must
 * still see their plan and "Manage billing" to update the card or cancel.
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
  // manual flip. A plain date is the whole of that NZ day. Keep it set after
  // the date: it is also when beta users' 7-day trial starts (betaTrialAnchor).
  const betaFreeUntil = parseBetaFreeUntil(process.env.BETA_FREE_UNTIL);
  const betaActive = betaFreeUntil !== null && now.getTime() <= betaFreeUntil.getTime();

  // Provisional trial dates using signedUpAt as the anchor. Used by
  // the owner-bypass + beta early returns where the trial state is
  // overridden anyway. The path below re-derives these from
  // profiles.trial_started_at if set.
  const provisionalTrialEndsAt = new Date(
    betaTrialAnchor(signedUpAt, betaFreeUntil).getTime() + TRIAL_DAYS * DAY_MS,
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

  // The beta window applies to everyone else too — treat them as paid so
  // there's no friction during invite-mates testing.
  const betaStatus = (
    trialEndsAt: Date,
    billing: { customer: string | null; status: string | null; managedByTeam: boolean },
  ): SubscriptionStatus => ({
    state: "paid",
    plan: null,
    managedByTeam: billing.managedByTeam,
    trialEndsAt,
    trialDaysLeft: null,
    currentPeriodEnd: betaFreeUntil,
    stripeCustomerId: billing.customer,
    stripeSubscriptionStatus: billing.status,
    betaFreeUntil,
  });

  const stripeConfigured = isStripeConfigured();
  // Without Stripe nobody can have been billed: the beta answer needs no reads.
  if (betaActive && !stripeConfigured) {
    return betaStatus(provisionalTrialEndsAt, { customer: null, status: null, managedByTeam: false });
  }

  let billing: Awaited<ReturnType<typeof readBilling>>;
  try {
    billing = await readBilling(userId, stripeConfigured);
  } catch (error) {
    // Everyone has access during the beta, so a failed read only costs the
    // billing button; outside it the caller must not guess.
    if (!betaActive) throw error;
    captureError(error, { route: "lib/subscription" });
    return betaStatus(provisionalTrialEndsAt, { customer: null, status: null, managedByTeam: false });
  }
  const { trialStartedAt, sub, billingUserId } = billing;
  const managedByTeam = billingUserId !== userId;
  // Only the user's own customer: a team member's billing is the owner's.
  const ownCustomer = managedByTeam ? null : sub?.stripe_customer_id ?? null;

  // Derive the real trial anchor.
  const trialAnchor = betaTrialAnchor(trialStartedAt ? new Date(trialStartedAt) : signedUpAt, betaFreeUntil);
  const trialEndsAt = new Date(trialAnchor.getTime() + TRIAL_DAYS * DAY_MS);
  const trialMsLeft = trialEndsAt.getTime() - now.getTime();
  const trialDaysLeft = Math.ceil(trialMsLeft / DAY_MS);
  const inTrial = trialMsLeft > 0;

  // No Stripe configured = everyone is on a permanent trial. Lets the
  // app run end-to-end during development before keys are wired. We
  // still respect the trial_started_at anchor in dev so test users
  // can experience the trial-expired UI by setting the anchor back.
  if (!stripeConfigured) {
    return {
      state: "trialing",
      trialEndsAt,
      trialDaysLeft: inTrial ? trialDaysLeft : 0,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      stripeSubscriptionStatus: null,
      betaFreeUntil: null,
    };
  }

  const subStatus = sub?.status ?? null;
  // Stripe's status for a real subscription. The row checkout saves before
  // any subscription exists holds a placeholder "incomplete": report none.
  const stripeStatus = sub?.stripe_subscription_id ? subStatus : null;
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
  const plan = storedPlan(sub?.plan);
  const hasActiveSub =
    subStatus !== null &&
    ACTIVE_STATUSES.has(subStatus) &&
    // If the period has ended and Stripe hasn't bumped us yet, treat
    // as expired so the user can't slip through a webhook delay.
    periodEnd !== null && periodEnd.getTime() > now.getTime() && plan !== null;

  if (hasActiveSub) {
    return {
      state: "paid",
      trialEndsAt,
      trialDaysLeft: null,
      currentPeriodEnd: periodEnd,
      plan,
      managedByTeam,
      stripeCustomerId: ownCustomer,
      stripeSubscriptionStatus: stripeStatus,
      betaFreeUntil: null,
    };
  }

  if (betaActive) {
    return betaStatus(trialEndsAt, { customer: ownCustomer, status: stripeStatus, managedByTeam });
  }

  return {
    state: inTrial ? "trialing" : "expired",
    managedByTeam,
    trialEndsAt,
    trialDaysLeft,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: ownCustomer,
    stripeSubscriptionStatus: stripeStatus,
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
