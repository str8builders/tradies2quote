/**
 * Client requests (/app/requests): what each request's status says and
 * whether it can be generated again. Shared by the old and the new look so
 * both read a request the same way. Pure, tested in node.
 */

import type { Tone } from "@/components/ui/styles";

/** A "new" request older than this never finished generating — offer recovery. */
export const STALE_MS = 5 * 60 * 1000;

export function isStaleRequest(createdAt: string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > STALE_MS;
}

const STATUS_LABEL: Record<string, string> = {
  new: "Draft being prepared",
  generated: "Draft ready to review",
  generation_failed: "Needs you to generate",
  dismissed: "Dismissed",
};

const STATUS_TONE: Record<string, Tone> = {
  new: "info",
  generated: "ok",
  generation_failed: "warn",
  dismissed: "neutral",
};

export interface RequestStatusRow {
  status: string;
  created_at: string;
  quote_id: string | null;
}

/** The draft quote behind a request: whether it has lines yet, and its status. */
export interface RequestQuoteState {
  hasLines: boolean;
  status: string;
}

export interface RequestStatus {
  label: string;
  tone: Tone;
}

/**
 * The truth about a draft is the quote itself: once it has line items the
 * request is ready, whatever the request row recorded.
 */
export function requestStatus(
  row: RequestStatusRow,
  quote: RequestQuoteState | undefined,
  now: number = Date.now(),
): RequestStatus {
  if (quote?.hasLines) {
    return quote.status === "draft"
      ? { label: "Draft ready to review", tone: "ok" }
      : { label: `Quote ${quote.status}`, tone: "neutral" };
  }
  if (row.status === "new" && isStaleRequest(row.created_at, now)) {
    return { label: "Needs you to generate", tone: "warn" };
  }
  return { label: STATUS_LABEL[row.status] ?? row.status, tone: STATUS_TONE[row.status] ?? "neutral" };
}

/** "Generate draft now": the draft has no lines and the automatic run failed or stalled. */
export function canGenerateDraft(
  row: RequestStatusRow,
  quote: RequestQuoteState | undefined,
  now: number = Date.now(),
): boolean {
  return (
    Boolean(row.quote_id) &&
    !quote?.hasLines &&
    (row.status === "generation_failed" || (row.status === "new" && isStaleRequest(row.created_at, now)))
  );
}

/** "021 555 0101 · sam@example.nz · 12 Rata St", or a plain note when there's nothing. */
export function requestContactLine(row: {
  client_phone: string | null;
  client_email: string | null;
  site_address: string | null;
}): string {
  return [row.client_phone, row.client_email, row.site_address].filter(Boolean).join(" · ") || "No contact details";
}

const RECEIVED = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

/** When the request came in, as the page has always printed it. */
export function requestReceivedLabel(createdAt: string): string {
  return RECEIVED.format(new Date(createdAt));
}

/** A quote_requests row as the page selects it. */
export interface RequestRow extends RequestStatusRow {
  id: string;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  site_address: string | null;
  description: string;
  error_message: string | null;
  seen_at: string | null;
}

/** One client request, ready for the new look (built on the server). */
export interface RequestItem {
  id: string;
  /** The draft quote the request made, if it made one. */
  quoteId: string | null;
  clientName: string;
  /** Phone, email and site address in one line, or "No contact details". */
  contact: string;
  description: string;
  /** A saved note about the draft, as it may be shown here (see `noteFor`). */
  note: string | null;
  status: RequestStatus;
  canGenerate: boolean;
  dismissed: boolean;
  /** Not opened before this visit. */
  unseen: boolean;
  /** When it came in, e.g. "26/09/2026, 3:04 pm". */
  received: string;
}

export function toRequestItem(
  row: RequestRow,
  quote: RequestQuoteState | undefined,
  /** The page's note wording (the iPhone app shows plain words, 3.1.3(f)). */
  noteFor: (note: string) => string,
  now: number = Date.now(),
): RequestItem {
  return {
    id: row.id,
    quoteId: row.quote_id,
    clientName: row.client_name,
    contact: requestContactLine(row),
    description: row.description,
    note: row.error_message ? noteFor(row.error_message) : null,
    status: requestStatus(row, quote, now),
    canGenerate: canGenerateDraft(row, quote, now),
    dismissed: row.status === "dismissed",
    unseen: !row.seen_at,
    received: requestReceivedLabel(row.created_at),
  };
}
