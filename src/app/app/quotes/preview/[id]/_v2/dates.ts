/**
 * Dates the job page prints, worked out once on the server so the phone
 * never renders a different day than the server did (no hydration drift).
 * NZ calendar days, engine-independent words (lib/format-date). Pure.
 */

import { formatNZShortDate, formatShortDayDate, parseDateKey } from "@/lib/format-date";
import type { InvoiceStatus } from "@/lib/types/invoice";
import type { JobInvoiceState } from "./job-view";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "22 Sept" for a timestamp, or null. */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const label = formatNZShortDate(iso);
  return label === "—" ? null : label;
}

/** The YYYY-MM-DD part of quotes.scheduled_for, when it is a real day. */
export function bookedDateKey(scheduledFor: string | null | undefined): string | null {
  const key = (scheduledFor ?? "").slice(0, 10);
  return parseDateKey(key) ? key : null;
}

/** "Tue, 30 Sept" for a booked day. */
export function bookedDayLabel(key: string | null): string | null {
  return key ? formatShortDayDate(key) : null;
}

/** The client can no longer accept once the expiry time has passed. */
export function isPastExpiry(expiresAt: string | null | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t < now.getTime();
}

/** Whole days an unpaid invoice is past its due date (0 when not late). */
export function invoiceDaysLate(
  status: InvoiceStatus,
  dueDate: string | null | undefined,
  now: Date,
): number {
  if (status !== "sent" && status !== "overdue") return 0;
  const due = dueDate ? Date.parse(dueDate) : NaN;
  if (!Number.isFinite(due) || due >= now.getTime()) return 0;
  return Math.floor((now.getTime() - due) / DAY_MS);
}

export function invoiceState(
  row: {
    status: InvoiceStatus;
    invoice_number: string;
    due_date: string | null;
    paid_at: string | null;
  },
  now: Date,
): JobInvoiceState {
  return {
    status: row.status,
    number: row.invoice_number,
    dueOn: shortDate(row.due_date),
    daysLate: invoiceDaysLate(row.status, row.due_date, now),
    paidOn: shortDate(row.paid_at),
  };
}

/** Local YYYY-MM-DD on this device, `offset` days from today (the date picker's day). */
export function localDateKey(now: Date, offsetDays = 0): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's local day key on this device, `offsetDays` from now (sheets only, never during SSR). */
export function todayKey(offsetDays = 0): string {
  return localDateKey(new Date(), offsetDays);
}
