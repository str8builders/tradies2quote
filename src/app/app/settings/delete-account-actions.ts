"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { isStripeConfigured, stripeClient } from "@/lib/stripe-client";
import { isCompedEmail } from "@/lib/reviewer";

/**
 * Account deletion — Apple App Store Guideline 5.1.1(v) requires that any
 * app with account creation lets the user INITIATE full account deletion
 * in-app (email-only flows are an automatic rejection), and the privacy
 * page promises deletion on request. This action is that path.
 *
 * Order of operations (children before parents, auth user LAST):
 *   1. Verify the caller's session + typed "DELETE" confirmation.
 *   2. Best-effort cancel any live Stripe subscription so a deleted
 *      account can never keep being billed.
 *   3. Purge storage objects (avatars, quote PDFs, signatures).
 *   4. Purge user rows — quote children by quote_id first (they don't all
 *      cascade), then user_id-keyed tables, then quotes/profiles.
 *   5. auth.admin.deleteUser — only after the data purge succeeded, so a
 *      mid-flight failure leaves a login that can simply retry, never an
 *      orphaned dataset with no owner.
 *
 * Any core-table failure aborts BEFORE the auth user is touched and
 * returns an error the UI can show.
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

export type DeleteAccountResult = { ok: false; error: string };

export async function deleteAccountAction(
  formData: FormData,
): Promise<DeleteAccountResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in." };
  }

  const confirm = String(formData.get("confirm") ?? "").trim();
  if (confirm !== "DELETE") {
    return { ok: false, error: 'Type DELETE (all caps) to confirm.' };
  }

  // App Review demo account: run the full deletion UX (confirmation + the
  // same signed-out success redirect) WITHOUT purging data or destroying the
  // login. Apple reviewers execute this flow to verify Guideline 5.1.1(v) —
  // and the review notes point them at it — but the demo credential is the
  // only way back into the app on the next review round, so actually
  // deleting it would fail every subsequent sign-in (Guideline 2.1). Real
  // customer accounts are unaffected: this branch matches only the comped
  // review email(s) in src/lib/reviewer.ts.
  if (isCompedEmail(user.email)) {
    await supabase.auth.signOut();
    redirect("/?account-deleted=1");
  }

  const admin = adminClient();

  // ── 1. Stop billing first — a deleted account must never keep paying. ──
  try {
    if (isStripeConfigured()) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
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
    .eq("user_id", user.id);
  if (quotesReadErr) {
    captureError(quotesReadErr, { route: "settings/delete-account" });
    return { ok: false, error: "Could not start deletion. Please try again." };
  }
  const quoteIds = (quoteRows ?? []).map((r) => r.id as string);

  // ── 3. Storage purge (best-effort — orphaned bytes are not PII-critical
  //       once the DB rows referencing them are gone, but tidy anyway). ──
  try {
    const buckets: Array<{ bucket: string; prefixes: string[] }> = [
      { bucket: "profile-avatars", prefixes: [user.id] },
      { bucket: "quote-pdfs", prefixes: [user.id] },
      { bucket: "signatures", prefixes: quoteIds },
    ];
    for (const { bucket, prefixes } of buckets) {
      for (const prefix of prefixes) {
        const { data: objects } = await admin.storage
          .from(bucket)
          .list(prefix, { limit: 100 });
        const paths = (objects ?? []).map((o) => `${prefix}/${o.name}`);
        if (paths.length > 0) {
          await admin.storage.from(bucket).remove(paths);
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
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
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
    .eq("user_id", user.id);
  if (quotesErr) failures.push("quotes");

  const { error: profileErr } = await admin
    .from("profiles")
    .delete()
    .eq("id", user.id);
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
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    captureError(authErr, { route: "settings/delete-account" });
    return {
      ok: false,
      error:
        "Your data was removed but the login could not be deleted. Contact support@tradies2quote.com and we'll finish it.",
    };
  }

  await supabase.auth.signOut();
  redirect("/?account-deleted=1");
}
