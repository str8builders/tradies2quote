import "server-only";
import { Environment } from "@apple/app-store-server-library";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { reconcileApple } from "./apple";

type ClaimedSubscription = { environment: string; original_transaction_id: string; user_id: string };

export async function runAppleReconciliation(dryRun = false) {
  const db = adminClient();
  if (dryRun) {
    const { count, error } = await db.from("apple_subscriptions" as never).select("original_transaction_id", { count: "exact", head: true }).not("user_id", "is", null);
    if (error) throw error;
    return { ok: true, dryRun: true, knownSubscriptions: count ?? 0, processed: 0, failed: 0, deferred: 0 };
  }
  const { data, error } = await db.rpc("claim_apple_reconciliation" as never, { p_limit: 10 } as never);
  if (error) throw error;
  const rows = (data ?? []) as ClaimedSubscription[];
  const deadline = Date.now() + 80_000;
  let processed = 0, failed = 0;
  for (const row of rows) {
    if (Date.now() >= deadline) break;
    try {
      if (![Environment.PRODUCTION, Environment.SANDBOX].includes(row.environment as Environment)) throw new Error("Invalid billing environment");
      await reconcileApple(row.original_transaction_id, row.environment as Environment, row.user_id);
      processed++;
    } catch {
      // Keep account tokens, private keys and transaction identifiers out of logs.
      captureError(new Error("Apple subscription status refresh failed"), { route: "cron/apple-reconcile" });
      failed++;
    }
  }
  return { ok: failed === 0, processed, failed, deferred: rows.length - processed - failed };
}
