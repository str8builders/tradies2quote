import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Billing status during and after the free beta.
 *
 * The beta used to answer "paid, no plan, no Stripe customer" before the
 * subscription was read, so paying subscribers lost "Manage billing" (and
 * with it the only way to cancel or update their card) while Stripe kept
 * charging them. BETA_FREE_UNTIL=2026-10-31 also ended at 1 pm NZDT.
 */

const db = vi.hoisted(() => ({
  teamOwner: null as string | null,
  trialStartedAt: null as string | null,
  sub: null as Record<string, unknown> | null,
  fail: false,
  reads: 0,
  stripe: true,
  capture: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({ captureError: db.capture }));
vi.mock("@/lib/stripe-client", () => ({ isStripeConfigured: () => db.stripe }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    rpc: async () => {
      db.reads += 1;
      return db.fail ? { data: null, error: { message: "offline" } } : { data: db.teamOwner, error: null };
    },
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => {
          db.reads += 1;
          if (db.fail) return { data: null, error: { message: "offline" } };
          if (table === "profiles") return { data: { trial_started_at: db.trialStartedAt }, error: null };
          return { data: db.sub, error: null };
        },
      };
      return query;
    },
  }),
}));

import { getSubscriptionStatus, parseBetaFreeUntil } from "./subscription";

const USER = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const SIGNED_UP = new Date("2026-08-01T00:00:00Z"); // trial long over by October

function status() {
  return getSubscriptionStatus({ userId: USER, signedUpAt: SIGNED_UP, email: "tradie@example.invalid" });
}

beforeEach(() => {
  Object.assign(db, { teamOwner: null, trialStartedAt: null, sub: null, fail: false, reads: 0, stripe: true });
  db.capture.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
  vi.stubEnv("BETA_FREE_UNTIL", "2026-10-31");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("BETA_FREE_UNTIL is the whole New Zealand day", () => {
  it("a plain date runs to 23:59:59.999 NZ time (NZDT in October, NZST in June)", () => {
    expect(parseBetaFreeUntil("2026-10-31")?.toISOString()).toBe("2026-10-31T10:59:59.999Z");
    expect(parseBetaFreeUntil(" 2026-06-01 ")?.toISOString()).toBe("2026-06-01T11:59:59.999Z");
  });

  it("gets the daylight-saving change days right", () => {
    // NZDT starts 2 am on 27 Sep 2026: the 26th still ends at NZST midnight.
    expect(parseBetaFreeUntil("2026-09-26")?.toISOString()).toBe("2026-09-26T11:59:59.999Z");
    expect(parseBetaFreeUntil("2026-09-27")?.toISOString()).toBe("2026-09-27T10:59:59.999Z");
    // NZDT ends 3 am on 4 Apr 2027.
    expect(parseBetaFreeUntil("2027-04-03")?.toISOString()).toBe("2027-04-03T10:59:59.999Z");
    expect(parseBetaFreeUntil("2027-04-04")?.toISOString()).toBe("2027-04-04T11:59:59.999Z");
  });

  it("keeps a full timestamp exactly, and ignores junk or impossible dates", () => {
    expect(parseBetaFreeUntil("2026-10-31T18:00:00+13:00")?.toISOString()).toBe("2026-10-31T05:00:00.000Z");
    expect(parseBetaFreeUntil("2026-02-31")).toBeNull();
    expect(parseBetaFreeUntil("soon")).toBeNull();
    expect(parseBetaFreeUntil("")).toBeNull();
    expect(parseBetaFreeUntil(undefined)).toBeNull();
  });

  it("free access lasts all of 31 October in New Zealand, not until 1 pm", async () => {
    vi.setSystemTime(new Date("2026-10-31T00:30:00Z")); // 1:30 pm NZDT on the 31st
    expect((await status()).betaFreeUntil).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-31T10:59:00Z")); // 11:59 pm NZDT
    expect((await status()).state).toBe("paid");
    vi.setSystemTime(new Date("2026-10-31T11:00:00Z")); // midnight: 1 November in NZ
    const after = await status();
    expect(after.betaFreeUntil).toBeNull();
    expect(after.state).toBe("expired");
  });
});

describe("the subscription is read before the beta decides anything", () => {
  it("a paying subscriber keeps their plan and Stripe customer during the beta", async () => {
    db.sub = { stripe_customer_id: "cus_paying", stripe_subscription_id: "sub_1", status: "active", current_period_end: "2026-11-15T00:00:00Z", plan: "crew" };
    const s = await status();
    expect(s).toMatchObject({ state: "paid", plan: "crew", stripeCustomerId: "cus_paying", stripeSubscriptionStatus: "active", managedByTeam: false });
    // Their subscription is what counts: no "free access" banner.
    expect(s.betaFreeUntil).toBeNull();
  });

  it("an unpaid or paused subscription during the beta still reaches Manage billing", async () => {
    for (const lapsed of ["unpaid", "paused", "incomplete", "past_due"]) {
      db.sub = { stripe_customer_id: "cus_lapsed", stripe_subscription_id: "sub_2", status: lapsed, current_period_end: "2026-09-01T00:00:00Z", plan: "solo" };
      const s = await status();
      expect(s.state).toBe("paid"); // free for everyone during the beta
      expect(s.plan).toBeNull();
      expect(s.stripeCustomerId).toBe("cus_lapsed");
      expect(s.stripeSubscriptionStatus).toBe(lapsed);
      expect(s.betaFreeUntil?.toISOString()).toBe("2026-10-31T10:59:59.999Z");
    }
  });

  it("an abandoned checkout keeps its customer but reports no subscription", async () => {
    // Checkout saves the customer (status placeholder "incomplete") before Stripe has a subscription.
    db.sub = { stripe_customer_id: "cus_started", stripe_subscription_id: null, status: "incomplete", current_period_end: null, plan: null };
    expect(await status()).toMatchObject({ state: "paid", stripeCustomerId: "cus_started", stripeSubscriptionStatus: null });
    vi.stubEnv("BETA_FREE_UNTIL", "");
    expect(await status()).toMatchObject({ state: "expired", stripeCustomerId: "cus_started", stripeSubscriptionStatus: null });
  });

  it("a beta tradie who never started checkout has nothing to manage", async () => {
    const s = await status();
    expect(s).toMatchObject({ state: "paid", plan: null, stripeCustomerId: null, stripeSubscriptionStatus: null });
  });

  it("after the beta, a lapsed or stale subscription is expired but keeps its customer", async () => {
    vi.stubEnv("BETA_FREE_UNTIL", "");
    db.sub = { stripe_customer_id: "cus_lapsed", stripe_subscription_id: "sub_2", status: "unpaid", current_period_end: "2026-11-01T00:00:00Z", plan: "solo" };
    expect(await status()).toMatchObject({ state: "expired", stripeCustomerId: "cus_lapsed", stripeSubscriptionStatus: "unpaid" });
    // "active" with a stored period end in the past: a webhook never landed.
    db.sub = { stripe_customer_id: "cus_stale", stripe_subscription_id: "sub_3", status: "active", current_period_end: "2026-10-01T00:00:00Z", plan: "solo" };
    expect(await status()).toMatchObject({ state: "expired", stripeCustomerId: "cus_stale" });
  });

  it("a team member never gets the owner's customer, in or out of the beta", async () => {
    db.teamOwner = OWNER;
    db.sub = { stripe_customer_id: "cus_owner", stripe_subscription_id: "sub_4", status: "unpaid", current_period_end: "2026-09-01T00:00:00Z", plan: "crew" };
    expect(await status()).toMatchObject({ state: "paid", managedByTeam: true, stripeCustomerId: null });
    vi.stubEnv("BETA_FREE_UNTIL", "");
    expect(await status()).toMatchObject({ state: "expired", managedByTeam: true, stripeCustomerId: null });
    db.sub = { ...db.sub, status: "active", current_period_end: "2026-11-15T00:00:00Z" };
    expect(await status()).toMatchObject({ state: "paid", plan: "crew", managedByTeam: true, stripeCustomerId: null });
  });

  it("a database failure during the beta still gives free access (and is reported)", async () => {
    db.fail = true;
    expect(await status()).toMatchObject({ state: "paid", stripeCustomerId: null });
    expect(db.capture).toHaveBeenCalledTimes(1);
  });

  it("outside the beta a database failure is not guessed at", async () => {
    vi.stubEnv("BETA_FREE_UNTIL", "2026-01-31");
    db.fail = true;
    await expect(status()).rejects.toMatchObject({ message: "offline" });
  });

  it("without Stripe the beta needs no database reads", async () => {
    db.stripe = false;
    expect(await status()).toMatchObject({ state: "paid", stripeCustomerId: null });
    expect(db.reads).toBe(0);
  });
});
