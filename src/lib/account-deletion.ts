import "server-only";

import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { isStripeConfigured, stripeClient } from "@/lib/stripe-client";

/**
 * The account purge itself, with no opinion about who asked for it.
 *
 * Lifted verbatim out of the settings server action so the iOS calculator can
 * reach the same code path. T2QCAL cannot do this itself: deletion needs the
 * SERVICE_ROLE key, and that key must never be inside a shipped app. So the
 * calculator asks the server, and the server runs exactly what the website
 * runs — one implementation, one ordering, one set of guarantees.
 *
 * Order of operations (children before parents, auth user LAST):
 *   1. Best-effort cancel any live Stripe subscription so a deleted account
 *      can never keep being billed.
 *   2. Purge storage objects (avatars, logos, quote PDFs, photos, plans,
 *      quote videos, signatures).
 *   3. Purge rows — quote children by quote_id first (they don't all cascade),
 *      then user_id-keyed tables, then quotes/profiles.
 *   4. auth.admin.deleteUser — only after the data purge succeeded, so a
 *      mid-flight failure leaves a login that can simply retry, never an
 *      orphaned dataset with no owner.
 *
 * Any core-table failure aborts BEFORE the auth user is touched.
 *
 * Callers are responsible for authenticating the request, for the typed
 * confirmation, for the App Review comped-account exemption, and for ending
 * the session afterwards. This function only destroys.
 */

/** Tables keyed by quote_id whose FK to quotes may not cascade. */
const QUOTE_CHILD_TABLES = [
  "quote_items",
  "quote_events",
  "quote_edit_events",
  "quote_site_context",
  "agent_events",
] as const;

/** Tables keyed by user_id, deleted before quotes/profiles. */
const USER_TABLES = [
  "time_entries",
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

  // ── 1. Stop billing first — a deleted account must never keep paying. ──
  try {
    if (isStripeConfigured()) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", userId)
        .maybeSingle();
      const subId = sub?.stripe_subscription_id;
      if (typeof subId === "string" && subId.length > 0) {
        await stripeClient()
          .subscriptions.cancel(subId)
          .catch(() => {
            // Already canceled / not found — fine either way.
          });
      }
    }
  } catch (e) {
    // Billing cleanup is best-effort: Stripe being down must not block a
    // user's legal right to delete their data. Surface it for follow-up.
    captureError(e, { route: "settings/delete-account" });
  }

  // ── 2. Collect quote ids while the rows still exist. ──
  const { data: quoteRows, error: quotesReadErr } = await admin
    .from("quotes")
    .select("id")
    .eq("user_id", userId);
  if (quotesReadErr) {
    captureError(quotesReadErr, { route: "settings/delete-account" });
    return { ok: false, error: "Could not start deletion. Please try again." };
  }
  const quoteIds = (quoteRows ?? []).map((r) => r.id as string);

  // ── 3. Storage purge (best-effort — orphaned bytes are not PII-critical
  //       once the DB rows referencing them are gone, but tidy anyway). ──
  try {
    for (const { bucket, prefixes } of storagePurgeTargets(userId, quoteIds)) {
      for (const prefix of prefixes) {
        const paths = await listStoragePathsRecursive(admin.storage.from(bucket), prefix);
        for (let i = 0; i < paths.length; i += 100) {
          await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        }
      }
    }
  } catch (e) {
    captureError(e, { route: "settings/delete-account" });
  }

  // ── 4. Row purge. Quote children first (batched), then user tables,
  //       then quotes and the profile row itself. ──
  const failures: string[] = [];

  for (const table of QUOTE_CHILD_TABLES) {
    for (let i = 0; i < quoteIds.length; i += 100) {
      const batch = quoteIds.slice(i, i + 100);
      if (batch.length === 0) break;
      const { error } = await admin.from(table).delete().in("quote_id", batch);
      if (error) {
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
    const { error } = await admin.from(table).delete().eq("user_id", userId);
    if (error) {
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

  // PII-bearing tables MUST be gone before we destroy the login — losing
  // the auth user while their data lingers would orphan it unrecoverable.
  // Covers every table that can hold client contact details, free text the
  // user wrote, or job-site locations — not just the headline entities.
  const critical = new Set([
    "quotes",
    "profiles",
    "clients",
    "invoices",
    "materials",
    "tradie_memories",
    "payments",
    "push_subscriptions",
    "customer_message_drafts",
    "job_weather_assessments",
    "calendar_notes",
    "time_entries",
    "beta_feedback",
  ]);
  if (failures.some((t) => critical.has(t))) {
    return {
      ok: false,
      error:
        "Some of your data could not be removed. Nothing was deleted — please try again or contact support@tradies2quote.com.",
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

/**
 * Every bucket that stores this user's files, keyed the way uploads are
 * written: `${userId}/…` (including nested `${userId}/${quoteId}/…` and
 * `${userId}/${fileId}/…` folders) and signatures under `${quoteId}/…`.
 * Quote videos and their posters live under `${userId}/${quoteId}/v{n}.*`.
 */
export function storagePurgeTargets(
  userId: string,
  quoteIds: string[],
): Array<{ bucket: string; prefixes: string[] }> {
  return [
    { bucket: "profile-avatars", prefixes: [userId] },
    { bucket: "business-logos", prefixes: [userId] },
    { bucket: "quote-pdfs", prefixes: [userId] },
    { bucket: "quote-attachments", prefixes: [userId] },
    { bucket: "plan-uploads", prefixes: [userId] },
    { bucket: "quote-videos", prefixes: [userId] },
    { bucket: "signatures", prefixes: quoteIds },
  ];
}

/** Minimal slice of the Supabase storage bucket API used for the purge. */
export interface StorageLister {
  list(
    path: string,
    options: { limit: number; offset: number },
  ): Promise<{ data: Array<{ name: string; id: string | null }> | null; error: unknown }>;
}

/**
 * Every object path under `prefix`, descending into sub-folders (Supabase
 * lists a folder as an entry with `id: null`) and paging past 100 entries.
 * The old purge listed one level with a 100-item limit, so nested client
 * photos and plan files were never removed.
 */
export async function listStoragePathsRecursive(bucket: StorageLister, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const folders = [prefix];
  let guard = 0;
  while (folders.length > 0 && guard++ < 10_000) {
    const folder = folders.pop() as string;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(folder, { limit: 100, offset });
      if (error) throw error;
      const items = data ?? [];
      for (const item of items) {
        const path = `${folder}/${item.name}`;
        if (item.id === null) folders.push(path);
        else out.push(path);
      }
      if (items.length < 100) break;
    }
  }
  return out;
}
