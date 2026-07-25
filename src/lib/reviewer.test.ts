import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCompedEmail } from "./reviewer";
import { getSubscriptionStatus } from "./subscription";
import { isOwnerEmail } from "./owner";

/**
 * Locks the App-Review access invariant (Guideline 2.1): the demo account's
 * "paid" state lives in CODE, not in a hand-inserted production DB row with a
 * live expiry. If this breaks, the reviewer hits the "trial ended" wall on the
 * marquee voice-to-quote flow mid-review — an automatic rejection.
 */

describe("isCompedEmail", () => {
  it("matches the App Review demo account (case/space-insensitive)", () => {
    expect(isCompedEmail("demo@tradies2quote.com")).toBe(true);
    expect(isCompedEmail("  Demo@Tradies2Quote.com ")).toBe(true);
  });

  it("does not match other users", () => {
    expect(isCompedEmail("someone@example.com")).toBe(false);
    expect(isCompedEmail("")).toBe(false);
    expect(isCompedEmail(null)).toBe(false);
    expect(isCompedEmail(undefined)).toBe(false);
  });

  it("the demo account is NOT the owner (must never see owner-only surfaces)", () => {
    expect(isOwnerEmail("demo@tradies2quote.com")).toBe(false);
  });
});

describe("getSubscriptionStatus — review comp", () => {
  const priorBeta = process.env.BETA_FREE_UNTIL;
  beforeEach(() => {
    delete process.env.BETA_FREE_UNTIL;
  });
  afterEach(() => {
    if (priorBeta === undefined) delete process.env.BETA_FREE_UNTIL;
    else process.env.BETA_FREE_UNTIL = priorBeta;
  });

  it("returns paid for the demo account with NO database dependency", async () => {
    // signedUpAt far in the past — a normal user would be `expired` (or hit
    // the DB for a subscriptions row, which this test does not provide).
    const status = await getSubscriptionStatus({
      userId: "00000000-0000-0000-0000-000000000000",
      signedUpAt: new Date("2020-01-01T00:00:00Z"),
      email: "demo@tradies2quote.com",
    });
    expect(status.state).toBe("paid");
    expect(status.stripeSubscriptionStatus).toBe("review_comp");
  });
});
