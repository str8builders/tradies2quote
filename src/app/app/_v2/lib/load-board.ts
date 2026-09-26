import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/observability";
import type { QuoteStatus } from "@/lib/quote-types";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { OPEN_REQUEST_STATUSES, type BoardRequest } from "./home-todos";
import {
  CO_DELETED_WITHIN_MS,
  DELETED_JOBS_DAYS,
  type BoardInvoice,
  type BoardQuote,
  type DeletedInvoice,
  type DeletedQuote,
} from "./job-board";

/**
 * Reads for the new-look Home and Jobs. The same queries the dashboard, the
 * Quotes list and the Invoices list already run — every one scoped to the
 * signed-in user's id and to rows that are not soft-deleted, on top of RLS —
 * narrowed to the columns the board needs (the job summary and client name
 * are JSON paths, as the Quotes list reads them).
 */

type Db = Pick<SupabaseClient, "from">;

/** Most recent jobs on the board. The old Quotes list loaded 100. */
export const BOARD_QUOTE_LIMIT = 500;
export const BOARD_INVOICE_LIMIT = 1000;
export const OPEN_REQUEST_LIMIT = 20;
/** Same rule as the old dashboard's "set your prices" banner. */
const PRICED = 0;

export const QUOTE_COLUMNS =
  "id, status, total_amount, currency, created_at, sent_at, viewed_at, accepted_at, scheduled_for, started_at, completed_at, archived_at, job_summary:quote_data->>job_summary, client_name:quote_data->client->>name";
export const INVOICE_COLUMNS =
  "id, quote_id, invoice_number, status, total_amount, currency, due_date, created_at, sent_at, paid_at";

type Row = Record<string, unknown>;

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const amount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function toBoardQuote(row: Row): BoardQuote {
  return {
    id: String(row.id),
    status: ((row.status as QuoteStatus | null) ?? "draft") as QuoteStatus,
    total: amount(row.total_amount),
    currency: text(row.currency) ?? "NZD",
    clientName: text(row.client_name),
    jobSummary: text(row.job_summary),
    createdAt: text(row.created_at) ?? "",
    sentAt: text(row.sent_at),
    viewedAt: text(row.viewed_at),
    acceptedAt: text(row.accepted_at),
    scheduledFor: text(row.scheduled_for),
    startedAt: text(row.started_at),
    completedAt: text(row.completed_at),
    archived: Boolean(row.archived_at),
  };
}

export function toBoardInvoice(row: Row): BoardInvoice {
  return {
    id: String(row.id),
    quoteId: String(row.quote_id),
    number: text(row.invoice_number) ?? "",
    status: ((row.status as InvoiceStatus | null) ?? "draft") as InvoiceStatus,
    total: amount(row.total_amount),
    currency: text(row.currency) ?? "NZD",
    dueDate: text(row.due_date),
    createdAt: text(row.created_at) ?? "",
    sentAt: text(row.sent_at),
    paidAt: text(row.paid_at),
  };
}

export interface Board {
  quotes: BoardQuote[];
  invoices: BoardInvoice[];
  /** A read failed: the board would be wrong, so the screen says so. */
  failed: boolean;
}

function report(error: unknown, route: string): void {
  console.error(`[${route}] read failed`, error);
  captureError(error, { route });
}

/** Every job (quote) and invoice of the user, newest first. */
export async function loadBoard(db: Db, userId: string, route = "app/jobs"): Promise<Board> {
  const [quotesRes, invoicesRes] = await Promise.all([
    db
      .from("quotes")
      .select(QUOTE_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(BOARD_QUOTE_LIMIT),
    db
      .from("invoices")
      .select(INVOICE_COLUMNS)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(BOARD_INVOICE_LIMIT),
  ]);
  if (quotesRes.error || invoicesRes.error) {
    report(quotesRes.error ?? invoicesRes.error, route);
    return { quotes: [], invoices: [], failed: true };
  }
  return {
    quotes: ((quotesRes.data ?? []) as Row[]).map(toBoardQuote),
    invoices: ((invoicesRes.data ?? []) as Row[]).map(toBoardInvoice),
    failed: false,
  };
}

/** Most jobs Recently deleted lists (the newest deletions). */
export const DELETED_QUOTE_LIMIT = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeletedBoard {
  quotes: DeletedQuote[];
  /** Invoices deleted over the same stretch, to pair with their jobs. */
  invoices: DeletedInvoice[];
  failed: boolean;
}

/**
 * Recently deleted: the user's jobs deleted in the last DELETED_JOBS_DAYS
 * days, newest deletion first, and the invoices deleted over the same
 * stretch (a few seconds more, so one deleted with the oldest job still
 * pairs up). Scoped to the user's id on top of RLS, like loadBoard. A
 * failure is reported; the Jobs list itself does not depend on it.
 */
export async function loadDeletedJobs(
  db: Db,
  userId: string,
  now: Date,
  route = "app/jobs:deleted",
): Promise<DeletedBoard> {
  const since = now.getTime() - DELETED_JOBS_DAYS * DAY_MS;
  const [quotesRes, invoicesRes] = await Promise.all([
    db
      .from("quotes")
      .select(`${QUOTE_COLUMNS}, deleted_at`)
      .eq("user_id", userId)
      .gt("deleted_at", new Date(since).toISOString())
      .order("deleted_at", { ascending: false })
      .limit(DELETED_QUOTE_LIMIT),
    db
      .from("invoices")
      .select(`${INVOICE_COLUMNS}, deleted_at`)
      .eq("user_id", userId)
      .gt("deleted_at", new Date(since - CO_DELETED_WITHIN_MS).toISOString())
      .order("deleted_at", { ascending: false })
      .limit(BOARD_INVOICE_LIMIT),
  ]);
  if (quotesRes.error || invoicesRes.error) {
    report(quotesRes.error ?? invoicesRes.error, route);
    return { quotes: [], invoices: [], failed: true };
  }
  const quotes: DeletedQuote[] = [];
  for (const row of (quotesRes.data ?? []) as Row[]) {
    const deletedAt = text(row.deleted_at);
    if (deletedAt) quotes.push({ ...toBoardQuote(row), deletedAt });
  }
  return {
    quotes,
    invoices: ((invoicesRes.data ?? []) as Row[]).map((row) => ({
      ...toBoardInvoice(row),
      deletedAt: text(row.deleted_at),
    })),
    failed: false,
  };
}

export interface HomeProfile {
  businessName: string | null;
  logoUrl: string | null;
  labourRate: number | null;
  address: string | null;
  country: string | null;
  currency: string | null;
}

export interface HomeExtras {
  profile: HomeProfile;
  /** Priced materials, or null when the setup card is hidden (not read). */
  pricedMaterials: number | null;
  requests: BoardRequest[];
}

/** The profile, the priced-materials count and the open client requests. */
export async function loadHomeExtras(
  db: Db,
  userId: string,
  { withSetup }: { withSetup: boolean },
): Promise<HomeExtras> {
  const [profileRes, materialsRes, requestsRes] = await Promise.all([
    // No row yet for a brand-new account: maybeSingle() → null.
    db
      .from("profiles")
      .select("business_name, logo_url, default_labour_rate, address, country, currency")
      .eq("id", userId)
      .maybeSingle(),
    withSetup
      ? db
          .from("materials")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .gt("default_unit_price", PRICED)
      : Promise.resolve(null),
    db
      .from("quote_requests")
      .select("id, quote_id, client_name, description, status, created_at")
      .eq("user_id", userId)
      .in("status", [...OPEN_REQUEST_STATUSES])
      .order("created_at", { ascending: true })
      .limit(OPEN_REQUEST_LIMIT),
  ]);

  if (profileRes.error) report(profileRes.error, "app/home:profile");
  if (materialsRes?.error) report(materialsRes.error, "app/home:materials");
  if (requestsRes.error) report(requestsRes.error, "app/home:requests");

  const p = (profileRes.data ?? {}) as Row;
  const rate = Number(p.default_labour_rate);
  return {
    profile: {
      businessName: text(p.business_name),
      logoUrl: text(p.logo_url),
      labourRate: p.default_labour_rate == null || !Number.isFinite(rate) ? null : rate,
      address: text(p.address),
      country: text(p.country),
      currency: text(p.currency),
    },
    pricedMaterials: materialsRes && !materialsRes.error ? (materialsRes.count ?? 0) : null,
    requests: ((requestsRes.data ?? []) as Row[]).map((r) => ({
      id: String(r.id),
      quoteId: text(r.quote_id),
      clientName: text(r.client_name),
      description: text(r.description),
      status: text(r.status) ?? "new",
      createdAt: text(r.created_at) ?? "",
    })),
  };
}
