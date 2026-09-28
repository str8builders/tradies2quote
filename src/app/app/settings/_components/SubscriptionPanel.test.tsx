// Old-look billing panel, rendered to static HTML: "Manage billing" must be
// reachable whenever the tradie has their own Stripe customer (audit
// 2026-09-28: during the free beta nobody could cancel or change their card).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SubscriptionStatus } from "@/lib/subscription";
import { SubscriptionPanel } from "./SubscriptionPanel";

const base: SubscriptionStatus = {
  state: "trialing",
  plan: null,
  managedByTeam: false,
  trialEndsAt: new Date("2026-10-02T12:00:00Z"),
  trialDaysLeft: 5,
  currentPeriodEnd: null,
  stripeCustomerId: null,
  stripeSubscriptionStatus: null,
  betaFreeUntil: null,
};

const render = (status: SubscriptionStatus) =>
  renderToStaticMarkup(<SubscriptionPanel status={status} stripeConfigured />);

describe("SubscriptionPanel", () => {
  it("during the beta: free access until the end date, and billing for a customer", () => {
    const out = render({
      ...base,
      state: "paid",
      trialDaysLeft: null,
      betaFreeUntil: new Date("2026-10-31T10:59:59.999Z"),
      stripeCustomerId: "cus_1",
      stripeSubscriptionStatus: "unpaid",
    });
    expect(out).toMatch(/Free access until 31 Oct 2026/);
    expect(out).toContain('data-testid="settings-manage-billing"');
  });

  it("a paying subscriber sees the plan and Manage billing", () => {
    const out = render({ ...base, state: "paid", plan: "solo", trialDaysLeft: null, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "active" });
    expect(out).toContain("Solo");
    expect(out).toContain("Manage billing");
  });

  it("an expired account with a lapsed subscription gets both buttons", () => {
    const out = render({ ...base, state: "expired", trialDaysLeft: -4, stripeCustomerId: "cus_1", stripeSubscriptionStatus: "unpaid" });
    expect(out).toContain('data-testid="settings-billing-upgrade-link"');
    expect(out).toContain('data-testid="settings-manage-billing"');
  });

  it("no customer, nothing to manage", () => {
    const out = render(base);
    expect(out).toContain("Choose a plan");
    expect(out).not.toContain("Manage billing");
  });

  it("a team member is pointed at the owner, never at checkout or the owner's billing", () => {
    const out = render({ ...base, state: "expired", trialDaysLeft: -1, managedByTeam: true, stripeCustomerId: "cus_owner" });
    expect(out).toContain("Your team owner manages billing.");
    expect(out).not.toContain("Choose a plan");
    expect(out).not.toContain("Manage billing");
  });
});
