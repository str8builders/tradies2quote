/**
 * Audit 2026-09-24 — post-acceptance edit lock.
 *
 * Once a customer accepts a quote its lines and prices are the agreed
 * contract, and `create_invoice_from_quote` later bills `quote_data` as it
 * stands. Scheduling moves the job on to scheduled / in_progress / completed,
 * so a lock that only checked `status === "accepted"` silently re-opened
 * editing the moment the job was scheduled.
 *
 * The lock is therefore defined by the statuses in which a quote is still an
 * OFFER the tradie may revise; every other status — accepted, each stage after
 * it in `OWNER_TRANSITIONS`, any billing status such as invoiced/paid, and any
 * status this code does not recognise — is locked (fail closed).
 *
 * Every server-side writer checks this first for a friendly message. The
 * database trigger `public.guard_quote_content` (migration
 * 20260924_quote_lock_version_accept_guards.sql) enforces the same list and is
 * the authority; `lock.test.ts` fails if the two lists drift.
 */
import type { QuoteStatus } from "@/lib/quote-types";

/**
 * Statuses whose customer-visible content may still change. `declined` and
 * `expired` stay editable because the tradie may revise and re-send them.
 */
export const EDITABLE_QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "declined",
  "expired",
] as const satisfies readonly QuoteStatus[];

/** Shown by every writer that refuses an edit to a locked quote. */
export const QUOTE_LOCKED_MESSAGE = "Quote already accepted — edits are locked.";

/** Postgres SQLSTATE raised by `public.guard_quote_content` for a locked quote. */
export const QUOTE_LOCKED_SQLSTATE = "55000";

const EDITABLE: ReadonlySet<string> = new Set(EDITABLE_QUOTE_STATUSES);

/**
 * True when the quote's lines, prices and client details must not change.
 * A missing status follows the app-wide `status ?? "draft"` convention.
 */
export function isQuoteLocked(status: string | null | undefined): boolean {
  return !EDITABLE.has(status ?? "draft");
}

/**
 * Why the transcript "Regenerate quote" action is refused. Regenerating wipes
 * every line and the total, so it is offered for drafts only.
 */
export function regenerateRefusalMessage(status: string | null | undefined): string {
  return isQuoteLocked(status)
    ? "This quote has been accepted, so it can't be regenerated. Its lines and prices are locked."
    : "Only draft quotes can be regenerated. This quote has already been sent to your client — edit its lines instead.";
}
