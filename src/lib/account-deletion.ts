import "server-only";

import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { tryStripe } from "@/lib/stripe-client";
import { isLiveSubscriptionStatus as isLive } from "@/lib/stripe-subscription";

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
 *   1. Cancel EVERY live Stripe subscription on the user's customer (not just
 *      the one id we stored), retrying Stripe's transient errors. If any
 *      cancel fails, nothing is deleted: a deleted account must never keep
 *      being billed, and a login that still exists can simply try again.
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

/**
 * Shown when billing could not be stopped. Deliberately says nothing about
 * plans or payments: the iPhone app shows it too (App Store 3.1.3(f)).
 */
export const BILLING_STOP_FAILED =
  "We couldn't close your account just now, so nothing was deleted. Please try again in a few minutes. If it keeps happening, email support@tradies2quote.com.";

/** The slice of the Stripe client the billing stop uses (a fake in tests). */
export interface BillingStripe {
  subscriptions: {
    list(params: { customer: string; status: "all"; limit: number; starting_after?: string }): PromiseLike<{
      data: Array<{ id: string; status: string }>;
      has_more: boolean;
    }>;
    retrieve(id: string): PromiseLike<{ id: string; status: string }>;
    cancel(id: string): PromiseLike<{ id: string; status: string }>;
  };
  checkout: {
    sessions: {
      list(params: { customer: string; status: "open"; limit: number }): PromiseLike<{ data: Array<{ id: string }> }>;
      expire(id: string): PromiseLike<unknown>;
    };
  };
}

type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Stripe's temporary failures: network/timeouts, rate limits, lock
 * conflicts (409) and its own 5xx. Anything else (a bad key, a missing
 * object) will not fix itself by asking again.
 */
export function isTransientStripeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { type?: unknown; statusCode?: unknown; code?: unknown };
  if (e.type === "StripeConnectionError" || e.type === "StripeRateLimitError" || e.type === "StripeAPIError") return true;
  if (e.code === "lock_timeout" || e.code === "rate_limit") return true;
  return typeof e.statusCode === "number" && (e.statusCode === 409 || e.statusCode === 429 || e.statusCode >= 500);
}

async function withStripeRetry<T>(run: () => PromiseLike<T>, sleep: Sleep, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isTransientStripeError(error)) throw error;
      await sleep(400 * 3 ** (attempt - 1)); // 0.4 s, then 1.2 s
    }
  }
}

function isMissing(error: unknown): boolean {
  const e = error as { code?: unknown; statusCode?: unknown } | null;
  return !!e && (e.code === "resource_missing" || e.statusCode === 404);
}

/**
 * Cancel every live subscription on `customerId`, plus `subscriptionId` if
 * Stripe lists it elsewhere (or no customer was stored). Throws when any
 * subscription is still live afterwards. Returns the ids it cancelled.
 */
export async function cancelLiveSubscriptions(
  stripe: BillingStripe,
  ids: { customerId: string | null; subscriptionId: string | null },
  sleep: Sleep = realSleep,
): Promise<string[]> {
  const live = new Map<string, string>();
  const seen = new Set<string>();
  if (ids.customerId) {
    const customer = ids.customerId;
    let startingAfter: string | undefined;
    for (let page = 0; page < 20; page++) {
      let list: { data: Array<{ id: string; status: string }>; has_more: boolean };
      try {
        list = await withStripeRetry(
          () =>
            stripe.subscriptions.list({
              customer,
              status: "all",
              limit: 100,
              ...(startingAfter ? { starting_after: startingAfter } : {}),
            }),
          sleep,
        );
      } catch (error) {
        // A customer Stripe doesn't have (deleted, which cancels everything
        // on it, or a test-mode id) has nothing left to bill.
        if (isMissing(error)) break;
        throw error;
      }
      for (const sub of list.data) {
        seen.add(sub.id);
        if (isLive(sub.status)) live.set(sub.id, sub.status);
      }
      if (!list.has_more || list.data.length === 0) break;
      startingAfter = list.data[list.data.length - 1].id;
    }
  }
  if (ids.subscriptionId && !seen.has(ids.subscriptionId)) {
    const subscriptionId = ids.subscriptionId;
    try {
      const sub = await withStripeRetry(() => stripe.subscriptions.retrieve(subscriptionId), sleep);
      if (isLive(sub.status)) live.set(sub.id, sub.status);
    } catch (error) {
      if (!isMissing(error)) throw error; // gone for good: nothing to bill
    }
  }

  const cancelled: string[] = [];
  for (const id of live.keys()) {
    try {
      const result = await withStripeRetry(() => stripe.subscriptions.cancel(id), sleep);
      if (isLive(result.status)) throw new Error(`Subscription ${id} is still ${result.status} after cancelling.`);
    } catch (error) {
      // A retry after a timeout can find it already cancelled: check before failing.
      const now = await withStripeRetry(() => stripe.subscriptions.retrieve(id), sleep).catch(() => null);
      if (!now || isLive(now.status)) throw error;
    }
    cancelled.push(id);
  }
  return cancelled;
}

/**
 * Step 1 of the purge. Reads the stored Stripe ids and cancels everything
 * live; any failure (the read, a missing key, a cancel) stops the deletion.
 * Open checkout pages are closed too (best effort: they expire within the
 * hour anyway) so none can start a subscription for a deleted account.
 */
export async function stopBilling(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  deps: { stripe?: BillingStripe | null; sleep?: Sleep } = {},
): Promise<PurgeResult> {
  const route = "settings/delete-account";
  const { data: row, error } = await admin
    .from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    captureError(error, { route, extra: { step: "billing.read" } });
    return { ok: false, error: BILLING_STOP_FAILED };
  }
  const customerId = row?.stripe_customer_id || null;
  const subscriptionId = row?.stripe_subscription_id || null;
  if (!customerId && !subscriptionId) return { ok: true };

  const stripe = deps.stripe === undefined ? (tryStripe() as BillingStripe | null) : deps.stripe;
  if (!stripe) {
    captureError(new Error("delete-account: Stripe ids are stored but STRIPE_SECRET_KEY is not set."), { route });
    return { ok: false, error: BILLING_STOP_FAILED };
  }
  const sleep = deps.sleep ?? realSleep;
  try {
    await cancelLiveSubscriptions(stripe, { customerId, subscriptionId }, sleep);
  } catch (e) {
    captureError(e, { route, extra: { step: "billing.cancel" } });
    return { ok: false, error: BILLING_STOP_FAILED };
  }
  if (customerId) {
    try {
      const open = await withStripeRetry(
        () => stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 }),
        sleep,
      );
      for (const session of open.data) {
        await withStripeRetry(() => stripe.checkout.sessions.expire(session.id), sleep);
      }
    } catch (e) {
      captureError(e, { route, extra: { step: "billing.checkout-expire" } });
    }
  }
  return { ok: true };
}

export async function purgeAccount(userId: string): Promise<PurgeResult> {
  const admin = adminClient();

  // ── 1. Stop billing first — a deleted account must never keep paying. ──
  // If Stripe can't confirm every subscription is cancelled, stop here with
  // nothing deleted: the login still exists, so the tradie can try again.
  const billing = await stopBilling(admin, userId);
  if (!billing.ok) return billing;

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
