import { describe, expect, it } from "vitest";
import { formatPlanDate, planSummary, type PlanStatus } from "./plan";

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
    expect(summary.action).toBe("choose");
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
    expect(summary.action).toBe("choose");
  });

  it("no checkout on this server: no button, a plain note", () => {
    const summary = planSummary(base, false);
    expect(summary.action).toBeNull();
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
    expect(summary.action).toBe("manage");
  });

  it("a team member is told the owner looks after billing, with no button", () => {
    const summary = planSummary(
      { ...base, state: "paid", plan: "crew", managedByTeam: true, stripeCustomerId: "cus_1" },
      true,
    );
    expect(summary.detail).toBe("Your team owner looks after billing.");
    expect(summary.action).toBeNull();
  });

  it("free access (no plan, no Stripe customer) has nothing to manage", () => {
    const summary = planSummary({ ...base, state: "paid", plan: null }, true);
    expect(summary.title).toBe("Tradies2Quote");
    expect(summary.detail).toBe("Your account has free access.");
    expect(summary.action).toBeNull();
  });
});
