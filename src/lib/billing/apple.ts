import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { AppStoreServerAPIClient, SignedDataVerifier, Environment, VerificationException, VerificationStatus, type JWSTransactionDecodedPayload, type ResponseBodyV2DecodedPayload } from "@apple/app-store-server-library";
import { adminClient } from "@/lib/supabase/admin";
import { MobileError } from "@/lib/mobile/contracts";
import { APPLE_BUNDLE_ID, appleProductPlans, appleSubscriptionsReady } from "./apple-config";
import { appleState } from "./apple-state";

const trustedRoots = () => ["AppleIncRootCertificate.cer", "AppleRootCA-G2.cer", "AppleRootCA-G3.cer"].map(file => readFileSync(path.join(process.cwd(), "src/lib/billing/apple-roots", file)));
function verifier(environment: Environment) {
  if (!appleSubscriptionsReady()) throw new MobileError(503, "Apple subscriptions are not yet configured.");
  return new SignedDataVerifier(trustedRoots(), true, environment, APPLE_BUNDLE_ID, Number(process.env.APPLE_APP_ID));
}
function api(environment: Environment) {
  return new AppStoreServerAPIClient(process.env.APPLE_IAP_PRIVATE_KEY!.replace(/\\n/g, "\n"), process.env.APPLE_IAP_KEY_ID!, process.env.APPLE_ISSUER_ID!, APPLE_BUNDLE_ID, environment);
}
async function decodeTransaction(signed: string): Promise<JWSTransactionDecodedPayload> {
  try { return await verifier(Environment.PRODUCTION).verifyAndDecodeTransaction(signed); }
  catch (error) {
    if (!(error instanceof VerificationException) || error.status !== VerificationStatus.INVALID_ENVIRONMENT) throw error;
    return verifier(Environment.SANDBOX).verifyAndDecodeTransaction(signed);
  }
}
async function decodeNotification(signed: string): Promise<ResponseBodyV2DecodedPayload> {
  try { return await verifier(Environment.PRODUCTION).verifyAndDecodeNotification(signed); }
  catch (error) {
    if (!(error instanceof VerificationException) || error.status !== VerificationStatus.INVALID_ENVIRONMENT) throw error;
    return verifier(Environment.SANDBOX).verifyAndDecodeNotification(signed);
  }
}
function sandboxAllowed(userId: string) { return (process.env.APPLE_SANDBOX_USER_IDS ?? "").split(",").map(s => s.trim().toLowerCase()).includes(userId.toLowerCase()); }

/** Reconcile against Apple's current status, never grant from an old client JWS. */
export async function reconcileApple(originalID: string, environment: Environment, expectedUserID?: string, eventID?: string) {
  const observed = Date.now();
  const response = await api(environment).getAllSubscriptionStatuses(originalID);
  const candidates = (response.data ?? []).flatMap(group => group.lastTransactions ?? []).filter(item => item.originalTransactionId === originalID);
  if (candidates.length !== 1 || !candidates[0].signedTransactionInfo || !candidates[0].status) throw new Error("Apple did not return a unique subscription status");
  const item = candidates[0]; const verify = verifier(environment);
  const transaction = await verify.verifyAndDecodeTransaction(item.signedTransactionInfo!);
  const renewal = item.signedRenewalInfo ? await verify.verifyAndDecodeRenewalInfo(item.signedRenewalInfo) : null;
  const state = appleState(transaction, renewal, item.status!, appleProductPlans(), observed);
  if (state.originalTransactionID !== originalID || state.environment !== environment) throw new Error("Apple subscription identifiers do not match");
  if (expectedUserID && state.accountToken !== expectedUserID.toLowerCase()) throw new MobileError(409, "This purchase belongs to a different Tradies2Quote account.");
  if (environment === Environment.SANDBOX && !sandboxAllowed(state.accountToken)) throw new MobileError(403, "This account is not enabled for sandbox purchases.");
  const { data, error } = await adminClient().rpc("apply_apple_subscription" as never, { p_state: state, p_event_id: eventID ?? null } as never);
  if (error) throw error;
  return data;
}
export async function verifyApplePurchase(userId: string, signed: string) {
  if (signed.length > 64000) throw new MobileError(413, "Purchase payload is too large.");
  let transaction: JWSTransactionDecodedPayload;
  try { transaction = await decodeTransaction(signed); }
  catch (error) { if (error instanceof MobileError) throw error; throw new MobileError(400, "Apple could not verify this purchase."); }
  if (transaction.appAccountToken?.toLowerCase() !== userId.toLowerCase() || !transaction.originalTransactionId) throw new MobileError(409, "This purchase belongs to a different Tradies2Quote account.");
  return reconcileApple(transaction.originalTransactionId, transaction.environment as Environment, userId);
}
export async function receiveAppleNotification(signed: string) {
  if (signed.length > 128000) throw new MobileError(413, "Notification payload is too large.");
  const notification = await decodeNotification(signed);
  if (!notification.notificationUUID || !notification.notificationType) throw new MobileError(400, "Invalid Apple notification.");
  const db = adminClient();
  const digest = createHash("sha256").update(signed).digest("hex");
  const { data: event, error } = await db.rpc("record_apple_notification" as never, { p_id: notification.notificationUUID, p_hash: digest, p_type: notification.notificationType } as never);
  if (error) throw error;
  if ((event as { handled?: boolean } | null)?.handled) return;
  if (!notification.data?.signedTransactionInfo) {
    if (notification.notificationType !== "TEST") throw new Error("Apple event has no transaction to reconcile");
    const result = await db.rpc("finish_apple_notification" as never, { p_id: notification.notificationUUID } as never);
    if (result.error) throw result.error;
    return;
  }
  const environment = notification.data.environment as Environment;
  const transaction = await verifier(environment).verifyAndDecodeTransaction(notification.data.signedTransactionInfo);
  if (!transaction.originalTransactionId) throw new MobileError(400, "Missing Apple transaction identifier.");
  await reconcileApple(transaction.originalTransactionId, environment, undefined, notification.notificationUUID);
}
