import "server-only";

import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { isStripeConfigured, stripeClient } from "@/lib/stripe-client";

/** Resumable account purge. Keep the login until every required step succeeds.
 * Storage contains personal data and is deleted through the storage API before
 * its database references. Repeating any completed step is safe. Apple billing
 * is managed by the customer separately; deleting an account cannot cancel it.
 */

/** Tables keyed by quote_id whose FK to quotes may not cascade. */
const QUOTE_CHILD_TABLES = [
  "quote_items",
  "quote_events",
  "quote_edit_events",
  "quote_site_context",
  "agent_events",
  "quote_attachments",
  "chat_reports",
] as const;

/** Tables keyed by user_id, deleted before quotes/profiles. */
const USER_TABLES = [
  "quote_requests",
  "terms_templates",
  "t2qcal_calculations",
  "customer_message_drafts",
  "job_weather_assessments",
  "ai_recommendations",
  "review_requests",
  "quote_followups",
  "payments",
  "invoices",
  "plan_sheets",
  "plan_files",
  "kit_items",
  "kits",
  "tradie_memories",
  "agent_runs",
  "push_subscriptions",
  "lifecycle_emails",
  "calendar_notes",
  "feature_settings",
  "beta_feedback",
  "materials",
  "clients",
  "payment_accounts",
  "subscriptions",
] as const;

export type PurgeResult = { ok: true } | { ok: false; error: string };

export async function purgeAccount(userId: string): Promise<PurgeResult> {
  const admin = adminClient();

  // Persist intent before external/storage work. Database and storage guards
  // prevent concurrent app/device writes; a failed step can be retried safely.
  const { error: beginError } = await admin.rpc("begin_account_deletion" as never, { p_user: userId } as never);
  if (beginError) {
    captureError(beginError, { route: "settings/delete-account/start" });
    return { ok: false, error: "Deletion could not start. Your account has not been changed. Please retry." };
  }

  // Cancel Stripe before removing its lookup record. A transient failure must
  // remain retryable, not orphan an active paid subscription.
  try {
    if (isStripeConfigured()) {
      const { data: sub, error } = await admin.from("subscriptions")
        .select("stripe_subscription_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      if (sub?.stripe_subscription_id) {
        try { await stripeClient().subscriptions.cancel(sub.stripe_subscription_id); }
        catch (error) {
          // Only a verified missing subscription is equivalent to cancellation.
          if (!(error && typeof error === "object" && "code" in error && error.code === "resource_missing")) throw error;
        }
      }
    }
  } catch (error) {
    captureError(error, { route: "settings/delete-account/billing" });
    return { ok: false, error: "We could not stop website subscription billing. Account changes are paused while deletion is pending. Retry deletion or contact support@tradies2quote.com." };
  }

  const quoteIds: string[] = [];
  try {
    // PostgREST has a page limit; one select would silently omit older quotes.
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await admin.from("quotes").select("id")
        .eq("user_id", userId).order("id").range(offset, offset + 499);
      if (error) throw error;
      quoteIds.push(...(data ?? []).map(row => row.id));
      if (!data || data.length < 500) break;
    }
    const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
    if (bucketError) throw bucketError;
    const existing = new Set((buckets ?? []).map(bucket => bucket.id));
    const targets = [
      ...["profile-avatars", "business-logos", "quote-pdfs", "quote-attachments", "plan-uploads"]
        .map(bucket => ({ bucket, prefixes: [userId] })),
      { bucket: "signatures", prefixes: quoteIds },
    ];
    for (const { bucket, prefixes } of targets) {
      if (!existing.has(bucket)) continue;
      const storage = admin.storage.from(bucket);
      for (const prefix of prefixes) await purgeStoragePrefix(storage, prefix);
    }
  } catch (error) {
    captureError(error, { route: "settings/delete-account/storage" });
    return { ok: false, error: "Deletion is incomplete. Some files may already have been removed. Your login is available so you can retry, or contact support@tradies2quote.com." };
  }

  // ── 4. Row purge. Quote children first (batched), then user tables,
  //       then quotes and the profile row itself. ──
  const failures: string[] = [];

  for (const table of QUOTE_CHILD_TABLES) {
    for (let i = 0; i < quoteIds.length; i += 100) {
      const batch = quoteIds.slice(i, i + 100);
      if (batch.length === 0) break;
      const { error } = await admin.from(table).delete().in("quote_id", batch);
      if (error && error.code !== "42P01" && error.code !== "PGRST205") {
        // Tables that already cascade or predate a column simply no-op;
        // a real failure is captured and, for PII tables, aborts below.
        captureError(
          new Error(`delete-account: ${table} purge failed: ${error.message}`),
          { route: "settings/delete-account" },
        );
        failures.push(table);
        break;
      }
    }
  }

  for (const table of USER_TABLES) {
    const { error } = await admin.from(table as "materials").delete().eq("user_id", userId);
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      captureError(
        new Error(`delete-account: ${table} purge failed: ${error.message}`),
        { route: "settings/delete-account" },
      );
      failures.push(table);
    }
  }

  const { error: quotesErr } = await admin
    .from("quotes")
    .delete()
    .eq("user_id", userId);
  if (quotesErr) failures.push("quotes");

  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);
  if (profileErr) failures.push("profiles");

  // Every enumerated personal-data table is required. An already-absent
  // table is handled above; an access or schema error must never be ignored.
  if (failures.length > 0) {
    return {
      ok: false,
      error:
        "Deletion is incomplete. Some data may already have been removed. Your login is still available so you can retry, or contact support@tradies2quote.com.",
    };
  }

  // ── 5. Destroy the login, end the session. ──
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    captureError(authErr, { route: "settings/delete-account" });
    return {
      ok: false,
      error:
        "Your data was removed but the login could not be deleted. Contact support@tradies2quote.com and we'll finish it.",
    };
  }

  return { ok: true };
}

/** Enumerate each level before removing files so pagination never skips rows. */
export async function purgeStoragePrefix(
  storage: ReturnType<ReturnType<typeof adminClient>["storage"]["from"]>,
  prefix: string,
): Promise<void> {
  const folders: string[] = [];
  const files: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    for (const object of data ?? []) {
      const path = `${prefix}/${object.name}`;
      if (object.id === null) folders.push(path); else files.push(path);
    }
    if (!data || data.length < 100) break;
  }
  for (const folder of folders) await purgeStoragePrefix(storage, folder);
  for (let start = 0; start < files.length; start += 100) {
    const { error } = await storage.remove(files.slice(start, start + 100));
    if (error) throw error;
  }
}
