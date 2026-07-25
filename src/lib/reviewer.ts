/**
 * App Store review accounts — comped access, in VERSION CONTROL.
 *
 * The App Review demo credential (documented in APP_STORE_REVIEW_NOTES.md)
 * must be able to exercise the app's core features on every review round,
 * forever. Before this file existed, its "paid" state was a hand-inserted
 * `subscriptions` row in the production DB with a live `current_period_end`
 * — a single point of failure that could silently expire mid-review and
 * bounce the reviewer into the "trial ended" wall on the marquee
 * voice-to-quote flow (an automatic Guideline 2.1 rejection).
 *
 * `getSubscriptionStatus` short-circuits to `paid` for these emails, the
 * same way it does for the owner — but via a SEPARATE list on purpose:
 * `isOwnerEmail` also unlocks the owner-only surfaces (/app/agents,
 * /app/debug), which a reviewer must never see.
 *
 * The demo account is also protected from the account-DELETION flow (see
 * delete-account-actions.ts): the review notes walk the reviewer through
 * deletion to prove Guideline 5.1.1(v), and actually destroying the only
 * demo login would fail every subsequent review round at sign-in.
 */

export const COMPED_REVIEW_EMAILS: ReadonlyArray<string> = [
  "demo@tradies2quote.com",
];

export function isCompedEmail(email: string | null | undefined): boolean {
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return COMPED_REVIEW_EMAILS.includes(normalized);
}
