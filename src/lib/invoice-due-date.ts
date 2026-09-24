const DAY_MS = 24 * 60 * 60 * 1000;

/** Payment term `create_invoice_from_quote` gives a new draft (now() + 7 days). */
export const DEFAULT_INVOICE_TERM_DAYS = 7;

/**
 * The due date to print on, and store with, an invoice being sent now.
 *
 * A draft's due date is fixed when the draft is created, so a draft sent a
 * week or more later used to arrive already due or overdue. On the FIRST send
 * the draft's payment term (due date minus draft date, normally 7 days) is
 * restarted from the send. A re-send (sent_at already set) keeps the date the
 * client was first given, so a reminder never quietly extends the terms.
 */
export function dueDateForSend(
  invoice: { created_at: string; due_date: string | null; sent_at: string | null },
  now: Date,
): string | null {
  if (invoice.sent_at || !invoice.due_date) return invoice.due_date;
  const term = Date.parse(invoice.due_date) - Date.parse(invoice.created_at);
  const termMs = Number.isFinite(term) && term > 0 ? term : DEFAULT_INVOICE_TERM_DAYS * DAY_MS;
  return new Date(now.getTime() + termMs).toISOString();
}
