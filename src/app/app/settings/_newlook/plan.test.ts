import { describe, expect, it } from "vitest";
import { canManageBilling, formatPlanDate, planSummary, type PlanStatus } from "./plan";

const base: PlanStatus = {
  state: "trialing",
  plan: null,
  managedByTeam: false,
  trialEndsAt: new Date("2026-10-02T12:00:00Z"),
  trialDaysLeft: 5,
  currentPeriodEnd: null,
  stripeCustomerId: null,
};

describe("Your Tradies2Quote plan", () => {
  it("a trial counts down and offers a plan", () => {
    const summary = planSummary(base, true);
    expect(summary.pill).toEqual({ tone: "info", label: "Free trial" });
    expect(summary.title).toBe("5 days left in your free trial");
    // Same date style as the old panel, in the server's time zone.
    expect(summary.detail).toContain(formatPlanDate(base.trialEndsAt));
    expect(formatPlanDate(base.trialEndsAt)).toMatch(/^\d{1,2} Oct 2026$/);
    expect(summary.actions).toEqual(["choose"]);
    expect(summary.note).toBeNull();
  });

  it("the last day says so", () => {
    expect(planSummary({ ...base, trialDaysLeft: 1 }, true).title).toBe("Last day of your free trial");
    expect(planSummary({ ...base, trialDaysLeft: 0 }, true).title).toBe("Last day of your free trial");
  });

  it("an ended trial keeps existing quotes and offers a plan", () => {
    const summary = planSummary({ ...base, state: "expired", trialDaysLeft: -3 }, true);
    expect(summary.pill).toEqual({ tone: "bad", label: "Trial ended" });
    expect(summary.title).toBe("Your free trial has ended");
    expect(summary.detail).toContain("still open and send");
    expect(summary.actions).toEqual(["choose"]);
  });

  it("no checkout on this server: no button, a plain note", () => {
    const summary = planSummary(base, false);
    expect(summary.actions).toEqual([]);
    expect(summary.note).toMatch(/can't be bought/);
  });

  it("a paid plan shows its name, price and paid-up date, with billing", () => {
    const summary = planSummary(
      {
        ...base,
        state: "paid",
        plan: "crew",
        trialDaysLeft: null,
        currentPeriodEnd: new Date("2026-10-25T12:00:00Z"),
        stripeCustomerId: "cus_123",
      },
      true,
    );
    expect(summary.pill).toEqual({ tone: "ok", label: "Active" });
    expect(summary.title).toBe("Tradies2Quote Crew");
    expect(summary.detail).toBe(`$79 NZD a month. Paid up to ${formatPlanDate(new Date("2026-10-25T12:00:00Z"))}.`);
    expect(summary.actions).toEqual(["manage"]);
  });

  it("a team member is told the owner looks after billing, with no button", () => {
    const summary = planSummary(
      { ...base, state: "paid", plan: "crew", managedByTeam: true, stripeCustomerId: "cus_1" },
      true,
    );
    expect(summary.detail).toBe("Your team owner looks after billing.");
    expect(summary.actions).toEqual([]);
  });

  it("free access (no plan, no Stripe customer) has nothing to manage", () => {
    const summary = planSummary({ ...base, state: "paid", plan: null }, true);
    expect(summary.title).toBe("Tradies2Quote");
    expect(summary.detail).toBe("Your account has free access.");
    expect(summary.actions).toEqual([]);
  });

  // Audit 2026-09-28: Manage billing only showed for "paid with a customer",
  // so during the beta (and for lapsed subscriptions) nobody could cancel.
  describe("Manage billing whenever there is a Stripe customer", () => {
    const beta = new Date("2026-10-31T10:59:59.999Z");

    it("during the beta: free access until the date, and billing for a subscriber", () => {
      const summary = planSummary(
        { ...base, state: "paid", trialDaysLeft: null, betaFreeUntil: beta, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "canceled" },
        true,
      );
      expect(summary.detail).toBe(`Free access until ${formatPlanDate(beta)}.`);
      expect(summary.detail).toMatch(/31 Oct 2026/);
      expect(summary.actions).toEqual(["manage"]);
    });

    it("during the beta, a subscription Stripe is still chasing says so", () => {
      const summary = planSummary(
        { ...base, state: "paid", trialDaysLeft: null, betaFreeUntil: beta, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "unpaid" },
        true,
      );
      expect(summary.detail).toContain("payment problem");
      expect(summary.actions).toEqual(["manage"]);
    });

    it("during the beta without a customer there is nothing to manage", () => {
      const summary = planSummary({ ...base, state: "paid", trialDaysLeft: null, betaFreeUntil: beta }, true);
      expect(summary.detail).toBe(`Free access until ${formatPlanDate(beta)}.`);
      expect(summary.actions).toEqual([]);
    });

    it("an unpaid subscription after the trial: fix the card first, then plans", () => {
      for (const status of ["unpaid", "past_due", "paused", "incomplete"]) {
        const summary = planSummary(
          { ...base, state: "expired", trialDaysLeft: -9, stripeCustomerId: "cus_1", stripeSubscriptionStatus: status },
          true,
        );
        expect(summary.pill).toEqual({ tone: "bad", label: "Payment problem" });
        expect(summary.title).toBe("Your subscription isn't paid up");
        expect(summary.actions).toEqual(["manage", "choose"]);
      }
    });

    it("a stale or ended subscription still offers billing next to the plans", () => {
      const summary = planSummary(
        { ...base, state: "expired", trialDaysLeft: -9, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "canceled" },
        true,
      );
      expect(summary.title).toBe("Your plan has ended");
      expect(summary.actions).toEqual(["choose", "manage"]);
    });

    it("an abandoned checkout in a trial: plans first, billing too", () => {
      const summary = planSummary({ ...base, stripeCustomerId: "cus_1", stripeSubscriptionStatus: null }, true);
      expect(summary.title).toBe("5 days left in your free trial");
      expect(summary.actions).toEqual(["choose", "manage"]);
    });

    it("a team member whose team plan lapsed is sent to the owner, not to checkout", () => {
      const summary = planSummary({ ...base, state: "expired", trialDaysLeft: -3, managedByTeam: true }, true);
      expect(summary.detail).toContain("team owner");
      expect(summary.actions).toEqual([]);
    });

    it("never for a team member, whose owner pays", () => {
      expect(canManageBilling({ ...base, stripeCustomerId: "cus_1", managedByTeam: true })).toBe(false);
      expect(canManageBilling({ ...base, stripeCustomerId: "cus_1" })).toBe(true);
      expect(canManageBilling(base)).toBe(false);
    });
  });
});
