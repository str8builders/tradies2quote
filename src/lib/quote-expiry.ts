/**
 * How long a sent quote stays open, and the one "valid until" date everything
 * shows: the client's link (quotes.expires_at), the job page and the PDF.
 *
 * The PDF used to print created + 30 days while the link expired 30 days after
 * the FIRST send, and a re-send kept an expiry that had already passed, so the
 * link was dead on arrival.
 */

export const QUOTE_VALIDITY_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function time(value: string | Date | null | undefined): number {
  if (value === null || value === undefined || value === "") return Number.NaN;
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

/** A fresh expiry: QUOTE_VALIDITY_DAYS from `now`. */
export function freshExpiry(now: Date): string {
  return new Date(now.getTime() + QUOTE_VALIDITY_DAYS * DAY_MS).toISOString();
}

/**
 * The expiry to store when a quote is sent (or sent again) at `now`: the one
 * it already has while that is still ahead, otherwise a fresh one. A reminder
 * never shortens or quietly extends a live offer; a quote whose date has
 * passed (or that never had one) goes out with a working link.
 */
export function expiryForSend(current: string | null | undefined, now: Date): string {
  const t = time(current);
  return Number.isFinite(t) && t > now.getTime() ? new Date(t).toISOString() : freshExpiry(now);
}

/**
 * The "valid until" date a quote document shows. A draft shows the date a
 * send now would set (its current expiry while still ahead, else a fresh
 * one); a quote that has been sent shows its stored expiry.
 */
export function quoteValidUntil(
  quote: { status?: string | null; expires_at?: string | null },
  now: Date,
): string {
  const status = quote.status ?? "draft";
  if (status === "draft") return expiryForSend(quote.expires_at, now);
  const t = time(quote.expires_at);
  return Number.isFinite(t) ? new Date(t).toISOString() : freshExpiry(now);
}

/** A printable date from a caller's value, or a fresh expiry when it is missing or not a date. */
export function documentValidUntil(value: string | Date | null | undefined, now: Date): Date {
  const t = time(value);
  return new Date(Number.isFinite(t) ? t : time(freshExpiry(now)));
}
