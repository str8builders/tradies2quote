import { Environment, Status, Type, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import type { PlanId } from "@/lib/plans";

export interface AppleState {
  originalTransactionID: string; transactionID: string; accountToken: string;
  environment: string; productID: string; plan: PlanId;
  status: "active" | "grace" | "expired" | "retry" | "revoked";
  expiresAt: string; accessUntil: string; signedAt: string; observedAt: string;
  autoRenews: boolean;
}

/** Called only with payloads already verified by Apple's SignedDataVerifier. */
export function appleState(transaction: JWSTransactionDecodedPayload, renewal: JWSRenewalInfoDecodedPayload | null, status: number, products: Record<string, PlanId>, observedAt: number, now = Date.now()): AppleState {
  const { originalTransactionId, transactionId, productId, appAccountToken, expiresDate, signedDate, environment } = transaction;
  if (!originalTransactionId || !transactionId || !productId || !products[productId] || !appAccountToken || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(appAccountToken)
    || transaction.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION || ![Environment.PRODUCTION, Environment.SANDBOX].includes(environment as Environment)
    || transaction.inAppOwnershipType !== "PURCHASED" || !Number.isFinite(expiresDate) || !Number.isFinite(signedDate) || Math.abs(expiresDate!) > 8.64e15 || Math.abs(signedDate!) > 8.64e15 || !Number.isFinite(observedAt)) throw new Error("Unsupported Apple subscription payload");
  if (renewal && (renewal.originalTransactionId !== originalTransactionId || renewal.environment !== environment)) throw new Error("Mismatched renewal payload");
  const revoked = transaction.revocationDate !== undefined || status === Status.REVOKED || transaction.isUpgraded === true;
  const grace = status === Status.BILLING_GRACE_PERIOD && typeof renewal?.gracePeriodExpiresDate === "number" && renewal.gracePeriodExpiresDate > now;
  const state = revoked ? "revoked" : grace ? "grace" : status === Status.ACTIVE && expiresDate! > now ? "active" : status === Status.BILLING_RETRY ? "retry" : "expired";
  const accessUntil = revoked ? Math.min(transaction.revocationDate ?? now, now) : grace ? renewal!.gracePeriodExpiresDate! : expiresDate!;
  return { originalTransactionID: originalTransactionId, transactionID: transactionId, accountToken: appAccountToken.toLowerCase(), environment: environment!, productID: productId, plan: products[productId], status: state,
    expiresAt: new Date(expiresDate!).toISOString(), accessUntil: new Date(accessUntil).toISOString(), signedAt: new Date(signedDate!).toISOString(), observedAt: new Date(observedAt).toISOString(), autoRenews: renewal?.autoRenewStatus === 1 };
}
