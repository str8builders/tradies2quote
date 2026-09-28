/**
 * What a send (email, platform text, or a text from the tradie's own phone)
 * does to a quote's status.
 *
 *   - draft, declined, expired → sent, with sent_at now and viewed_at
 *     cleared: a first send, or a fresh offer after a "no" or after the old
 *     one lapsed ("Send it again").
 *   - sent, viewed → unchanged, sent_at kept: a reminder never walks a quote
 *     the client has opened back to "sent", nor moves the follow-up anchor.
 *   - anything else (accepted and every stage after it) → never touched.
 *
 * The routes apply these as conditional updates (`status in (…)`) and check
 * the rows they changed, so a client accepting during the seconds a send
 * takes is never reverted.
 */
import { EDITABLE_QUOTE_STATUSES } from "@/lib/lifecycle/lock";
import type { QuoteStatus } from "@/lib/quote-types";

/** Statuses a send moves to "sent". */
export const STATUSES_A_SEND_REOPENS = ["draft", "declined", "expired"] as const satisfies readonly QuoteStatus[];

/** Statuses a quote can be sent (or sent again) from: every status that is still an offer. */
export const SENDABLE_QUOTE_STATUSES: readonly QuoteStatus[] = EDITABLE_QUOTE_STATUSES;

/** True when sending this quote moves it to "sent" (and stamps sent_at). */
export function sendMovesToSent(status: string | null | undefined): boolean {
  return (STATUSES_A_SEND_REOPENS as readonly string[]).includes(status ?? "draft");
}

/** Rows a `.select()` after a conditional update says it changed. */
export function changedRows(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  return data ? 1 : 0;
}
