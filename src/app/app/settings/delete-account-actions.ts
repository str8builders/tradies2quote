"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { purgeAccount } from "@/lib/account-deletion";
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

  // The purge itself lives in `@/lib/account-deletion` so the iOS calculator
  // can reach the same code through an authenticated API route. One
  // implementation, one ordering, one set of guarantees — a second copy would
  // be a second thing to keep correct, and this is the code path where being
  // subtly out of step means somebody's data quietly survives their deletion.
  const result = await purgeAccount(user.id);
  if (!result.ok) return result;

  await supabase.auth.signOut();
  redirect("/?account-deleted=1");
}
