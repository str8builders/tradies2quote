import { describe, expect, it } from "vitest";
import { Environment, Status, Type, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { appleState } from "./apple-state";

const now = Date.parse("2026-09-21T00:00:00Z");
const product = "com.str8builders.tradies2quote.solo.monthly";
const transaction: JWSTransactionDecodedPayload = {
  originalTransactionId: "10001", transactionId: "10002", productId: product,
  appAccountToken: "10101010-1010-4010-8010-101010101010", environment: Environment.PRODUCTION,
  type: Type.AUTO_RENEWABLE_SUBSCRIPTION, inAppOwnershipType: "PURCHASED",
  expiresDate: now + 86_400_000, signedDate: now,
};
const renewal: JWSRenewalInfoDecodedPayload = { originalTransactionId: "10001", environment: Environment.PRODUCTION, autoRenewStatus: 1 };
const state = (patch: Partial<JWSTransactionDecodedPayload> = {}, status: number = Status.ACTIVE, nextRenewal: JWSRenewalInfoDecodedPayload | null = renewal) => appleState({ ...transaction, ...patch }, nextRenewal, status, { [product]: "solo" }, now, now);
describe("verified Apple subscription lifecycle", () => {
  it("grants current paid access with a stable account binding", () => {
    expect(state()).toMatchObject({ status: "active", plan: "solo", accountToken: transaction.appAccountToken, autoRenews: true });
  });
  it("keeps access when renewal is cancelled until the paid period ends", () => {
    expect(state({}, Status.ACTIVE, { ...renewal, autoRenewStatus: 0 })).toMatchObject({ status: "active", autoRenews: false });
  });
  it("does not revive an expired transaction with an ACTIVE status", () => {
    expect(state({ expiresDate: now - 1 }).status).toBe("expired");
  });
  it("grants only Apple's verified grace period", () => {
    const result = state({ expiresDate: now - 1 }, Status.BILLING_GRACE_PERIOD, { ...renewal, gracePeriodExpiresDate: now + 60_000 });
    expect(result.status).toBe("grace"); expect(result.accessUntil).toBe(new Date(now + 60_000).toISOString());
    expect(state({ expiresDate: now - 1 }, Status.BILLING_GRACE_PERIOD, null).status).toBe("expired");
  });
  it("billing retry without grace does not grant active access", () => { expect(state({}, Status.BILLING_RETRY).status).toBe("retry"); });
  it.each([{ revocationDate: now - 10 }, { isUpgraded: true }])("revokes refunded or superseded transactions: %j", patch => {
    const result = state(patch); expect(result.status).toBe("revoked"); expect(Date.parse(result.accessUntil)).toBeLessThanOrEqual(now);
  });
  it.each([
    { appAccountToken: undefined }, { appAccountToken: "not-a-user" }, { productId: "foreign-product" },
    { expiresDate: Number.NaN }, { signedDate: Infinity }, { expiresDate: 9e20 },
    { type: Type.CONSUMABLE }, { inAppOwnershipType: "FAMILY_SHARED" }, { inAppOwnershipType: undefined },
    { environment: "Xcode" },
  ])("rejects unsupported data: %j", patch => { expect(() => state(patch)).toThrow(); });
  it("rejects another transaction's renewal or environment", () => {
    expect(() => state({}, Status.ACTIVE, { ...renewal, originalTransactionId: "other" })).toThrow();
    expect(() => state({}, Status.ACTIVE, { ...renewal, environment: Environment.SANDBOX })).toThrow();
  });
});
