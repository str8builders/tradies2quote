/**
 * The Jobs board: one row per quote with its invoice folded in (new look).
 *
 * Pure. The page loads quotes and invoices exactly as before (RLS-scoped,
 * soft-deleted rows left out) and this module decides, for each job, which
 * filter it belongs to, the plain-words status pill and its place in the
 * list. Nothing here writes or changes a status.
 *
 * Statuses, from the database:
 *   quotes.status   draft · sent · viewed · accepted · scheduled ·
 *                   in_progress · completed · declined · expired
 *   invoices.status draft · sent · overdue · paid · cancelled
 *
 * "The invoice" of a job is its live invoice: not deleted, not cancelled,
 * the earliest one (create_invoice_from_quote hands back the first; the job
 * page ignores cancelled ones). An invoice is late when it is marked overdue,
 * or sent and its due date has passed (nothing flips sent to overdue by
 * itself yet).
 */

import type { IconTone, Tone } from "@/components/ui/styles";
import { displayClientName, isPlaceholderClientName } from "@/lib/quote-defaults";
import type { QuoteStatus } from "@/lib/quote-types";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { agoText, countOf, dayKeyInZone, daysBetweenKeys, shortDay } from "./dates";

export interface BoardQuote {
  id: string;
  status: QuoteStatus;
  total: number;
  currency: string;
  /** As stored; may be a placeholder like "To be confirmed". */
  clientName: string | null;
  jobSummary: string | null;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  scheduledFor: string | null;
  startedAt: string | null;
  completedAt: string | null;
  archived: boolean;
}

export interface BoardInvoice {
  id: string;
  quoteId: string;
  number: string;
  status: InvoiceStatus;
  total: number;
  currency: string;
  dueDate: string | null;
  createdAt: string;
  sentAt: string | null;
  paidAt: string | null;
}

export type JobFilter = "all" | "to-send" | "waiting" | "booked" | "unpaid" | "done";
export type StageFilter = Exclude<JobFilter, "all">;

export const JOB_FILTERS: ReadonlyArray<{ id: JobFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "to-send", label: "To send" },
  { id: "waiting", label: "Waiting" },
  { id: "booked", label: "Booked" },
  { id: "unpaid", label: "Unpaid" },
  { id: "done", label: "Done" },
];

export function parseJobFilter(raw: unknown): JobFilter {
  return JOB_FILTERS.some((f) => f.id === raw) ? (raw as JobFilter) : "all";
}

export const JOBS_PATH = "/app/jobs";

export function jobsHref(filter: JobFilter): string {
  return filter === "all" ? JOBS_PATH : `${JOBS_PATH}?show=${filter}`;
}

/** The job page (the quote preview route). */
export function jobHref(quoteId: string): string {
  return `/app/quotes/preview/${encodeURIComponent(quoteId)}`;
}

export type JobStage =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "scheduled"
  | "in_progress"
  | "not_invoiced"
  | "invoice_draft"
  | "invoice_sent"
  | "invoice_late"
  | "paid"
  | "declined"
  | "expired";

/** Which stage filter each stage lives under (null: only under All). */
export const STAGE_FILTER: Readonly<Record<JobStage, StageFilter | null>> = {
  draft: "to-send",
  sent: "waiting",
  viewed: "waiting",
  accepted: "booked",
  scheduled: "booked",
  in_progress: "booked",
  not_invoiced: "unpaid",
  invoice_draft: "unpaid",
  invoice_sent: "unpaid",
  invoice_late: "unpaid",
  paid: "done",
  declined: null,
  expired: null,
};

export interface StatusPillData {
  text: string;
  tone: Tone;
}

export interface JobState {
  stage: JobStage;
  /** Its one stage filter; null for declined, expired and archived jobs. */
  filter: StageFilter | null;
  pill: StatusPillData;
  /** Calendar days past due for a late invoice (0 = marked overdue, not past its date). */
  daysLate: number | null;
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? Number.NaN : t;
}

/** One live invoice per quote: cancelled ones are ignored, the earliest wins. */
export function liveInvoicesByQuote(invoices: readonly BoardInvoice[]): Map<string, BoardInvoice> {
  const byQuote = new Map<string, BoardInvoice>();
  const ordered = [...invoices].sort((a, b) => (ms(a.createdAt) || 0) - (ms(b.createdAt) || 0));
  for (const invoice of ordered) {
    if (invoice.status === "cancelled") continue;
    if (!byQuote.has(invoice.quoteId)) byQuote.set(invoice.quoteId, invoice);
  }
  return byQuote;
}

/**
 * Days late, counted in calendar days in the business's time zone: an
 * invoice due on the 2nd is 1 day late on the 3rd. Null when it isn't late
 * (paid, draft, cancelled, or sent and not yet past its due date).
 */
export function invoiceLateDays(invoice: BoardInvoice, now: Date, timeZone: string): number | null {
  if (invoice.status !== "sent" && invoice.status !== "overdue") return null;
  const dueKey = invoice.dueDate ? dayKeyInZone(new Date(invoice.dueDate), timeZone) : null;
  const days = daysBetweenKeys(dueKey, dayKeyInZone(now, timeZone));
  if (days !== null && days > 0) return days;
  return invoice.status === "overdue" ? 0 : null;
}

/** "Sam" from "Sam Taylor"; null for placeholder names. */
export function clientFirstName(name: string | null | undefined): string | null {
  if (isPlaceholderClientName(name)) return null;
  const first = (name ?? "").trim().split(/\s+/)[0]?.replace(/[,.;:]+$/, "") ?? "";
  return first || null;
}

function stageOf(quote: BoardQuote, invoice: BoardInvoice | null, daysLate: number | null): JobStage {
  if (invoice) {
    if (invoice.status === "paid") return "paid";
    if (daysLate !== null) return "invoice_late";
    if (invoice.status === "draft") return "invoice_draft";
    return "invoice_sent";
  }
  switch (quote.status) {
    case "sent":
    case "viewed":
    case "accepted":
    case "scheduled":
    case "in_progress":
    case "declined":
    case "expired":
      return quote.status;
    case "completed":
      return "not_invoiced";
    default:
      return "draft";
  }
}

function pillFor(stage: JobStage, quote: BoardQuote, daysLate: number | null): StatusPillData {
  const first = clientFirstName(quote.clientName);
  switch (stage) {
    case "draft":
      return { text: "Draft", tone: "neutral" };
    case "sent":
      return { text: first ? `Waiting for ${first}` : "Waiting for a reply", tone: "info" };
    case "viewed":
      return { text: first ? `Seen by ${first}` : "Seen, no reply yet", tone: "info" };
    case "accepted":
      return { text: "Accepted", tone: "ok" };
    case "scheduled": {
      const day = shortDay(quote.scheduledFor);
      return { text: day ? `Booked ${day}` : "Booked", tone: "ok" };
    }
    case "in_progress":
      return { text: "Job started", tone: "info" };
    case "not_invoiced":
      return { text: "Not invoiced", tone: "warn" };
    case "invoice_draft":
      return { text: "Invoice not sent", tone: "warn" };
    case "invoice_sent":
      return { text: "Invoice sent", tone: "info" };
    case "invoice_late":
      return { text: daysLate ? `${countOf(daysLate, "day")} late` : "Overdue", tone: "bad" };
    case "paid":
      return { text: "Paid", tone: "ok" };
    case "declined":
      return { text: "Declined", tone: "neutral" };
    case "expired":
      return { text: "Expired", tone: "neutral" };
  }
}

/**
 * Where a job stands. The invoice decides once there is one (invoices only
 * exist for completed jobs); before that the quote's status does. Archived
 * jobs keep their pill but only show under All.
 */
export function jobState(
  quote: BoardQuote,
  invoice: BoardInvoice | null,
  now: Date,
  timeZone: string,
): JobState {
  const daysLate = invoice ? invoiceLateDays(invoice, now, timeZone) : null;
  const stage = stageOf(quote, invoice, daysLate);
  return {
    stage,
    filter: quote.archived ? null : STAGE_FILTER[stage],
    pill: pillFor(stage, quote, daysLate),
    daysLate: stage === "invoice_late" ? daysLate : null,
  };
}

/** What the Jobs list gets for each row: plain data, labels already worked out. */
export interface JobRow {
  id: string;
  href: string;
  client: string;
  job: string;
  amount: number;
  currency: string;
  pill: StatusPillData;
  filter: StageFilter | null;
  archived: boolean;
  /** Place within its own filter's list (0 = first). */
  rank: number;
  /** Its live invoice's status; null before there is one. */
  invoiceStatus?: InvoiceStatus | null;
  /** The client has had the quote (sent, seen or answered), so may hold its link. */
  sentToClient?: boolean;
}

export const NO_CLIENT_NAME = "No client name yet";
export const JOB_TEXT_MAX = 140;

function clip(text: string | null | undefined, max: number): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

interface Entry {
  quote: BoardQuote;
  invoice: BoardInvoice | null;
  state: JobState;
}

const INVOICE_STAGES: ReadonlySet<JobStage> = new Set([
  "invoice_draft",
  "invoice_sent",
  "invoice_late",
  "paid",
]);

/** Ascending on a timestamp, unknown times last. */
function asc(a: number, b: number): number {
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1;
  if (Number.isNaN(b)) return -1;
  return a - b;
}

function newestFirst(a: Entry, b: Entry): number {
  return asc(ms(b.quote.createdAt), ms(a.quote.createdAt));
}

const BOOKED_ORDER: Partial<Record<JobStage, number>> = { in_progress: 0, accepted: 1, scheduled: 2 };
const UNPAID_ORDER: Partial<Record<JobStage, number>> = {
  invoice_late: 0,
  not_invoiced: 1,
  invoice_draft: 1,
  invoice_sent: 2,
};

/**
 * The order inside each filter: what to act on first at the top.
 *   To send  newest draft first
 *   Waiting  waiting longest first (who to chase)
 *   Booked   started jobs, then accepted without a date, then by job date
 *   Unpaid   most days late, then finished and not invoiced, then by due date
 *   Done     most recently paid first
 */
function compareIn(filter: StageFilter): (a: Entry, b: Entry) => number {
  switch (filter) {
    case "to-send":
      return newestFirst;
    case "waiting":
      return (a, b) =>
        asc(ms(a.quote.sentAt ?? a.quote.createdAt), ms(b.quote.sentAt ?? b.quote.createdAt)) ||
        newestFirst(a, b);
    case "booked":
      return (a, b) => {
        const group = (BOOKED_ORDER[a.state.stage] ?? 3) - (BOOKED_ORDER[b.state.stage] ?? 3);
        if (group) return group;
        const when = (e: Entry) =>
          e.state.stage === "in_progress"
            ? ms(e.quote.startedAt)
            : e.state.stage === "accepted"
              ? ms(e.quote.acceptedAt)
              : ms(e.quote.scheduledFor);
        return asc(when(a), when(b)) || newestFirst(a, b);
      };
    case "unpaid":
      return (a, b) => {
        const group = (UNPAID_ORDER[a.state.stage] ?? 3) - (UNPAID_ORDER[b.state.stage] ?? 3);
        if (group) return group;
        if (a.state.stage === "invoice_late" && b.state.stage === "invoice_late") {
          const late = (b.state.daysLate ?? 0) - (a.state.daysLate ?? 0);
          if (late) return late;
        }
        const when = (e: Entry) =>
          e.state.stage === "invoice_sent" || e.state.stage === "invoice_late"
            ? ms(e.invoice?.dueDate)
            : ms(e.quote.completedAt ?? e.quote.createdAt);
        return asc(when(a), when(b)) || newestFirst(a, b);
      };
    case "done":
      return (a, b) => asc(ms(b.invoice?.paidAt), ms(a.invoice?.paidAt)) || newestFirst(a, b);
  }
}

/**
 * Every job as a list row, newest first (the All order), each ranked inside
 * its own filter. Amounts are what the client is billed once there is an
 * invoice, the quote total before that.
 */
export function buildJobRows(
  quotes: readonly BoardQuote[],
  invoices: readonly BoardInvoice[],
  now: Date,
  timeZone: string,
): JobRow[] {
  const live = liveInvoicesByQuote(invoices);
  const entries: Entry[] = quotes.map((quote) => {
    const invoice = live.get(quote.id) ?? null;
    return { quote, invoice, state: jobState(quote, invoice, now, timeZone) };
  });
  entries.sort(newestFirst);

  const rank = new Map<string, number>();
  for (const { id } of JOB_FILTERS) {
    if (id === "all") continue;
    entries
      .filter((e) => e.state.filter === id)
      .sort(compareIn(id))
      .forEach((e, i) => rank.set(e.quote.id, i));
  }

  return entries.map(({ quote, invoice, state }) => {
    const billed = invoice && INVOICE_STAGES.has(state.stage) ? invoice : null;
    return {
      id: quote.id,
      href: jobHref(quote.id),
      client: clip(displayClientName(quote.clientName, NO_CLIENT_NAME), 80),
      job: clip(quote.jobSummary, JOB_TEXT_MAX),
      amount: billed ? billed.total : quote.total,
      currency: (billed ? billed.currency : quote.currency) || "NZD",
      pill: state.pill,
      filter: state.filter,
      archived: quote.archived,
      rank: rank.get(quote.id) ?? 0,
      invoiceStatus: invoice?.status ?? null,
      sentToClient: wasSentToClient(quote),
    };
  });
}

const SENT_STATUSES: ReadonlySet<QuoteStatus> = new Set(["sent", "viewed", "accepted", "declined", "expired"]);

/** Sent, seen or answered: the client may have the quote's link. */
function wasSentToClient(quote: BoardQuote): boolean {
  return Boolean(quote.sentAt || quote.viewedAt || quote.acceptedAt) || SENT_STATUSES.has(quote.status);
}

/** The rows a filter shows, in its order. */
export function rowsForFilter(rows: readonly JobRow[], filter: JobFilter): JobRow[] {
  if (filter === "all") return rows.slice();
  return rows.filter((r) => r.filter === filter).sort((a, b) => a.rank - b.rank);
}

export function normalizeSearch(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Search by client or job: every word typed has to appear in one of them. */
export function matchesSearch(row: JobRow, query: string): boolean {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = `${row.client} ${row.job}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}

export function filterCounts(rows: readonly JobRow[]): Record<JobFilter, number> {
  const counts: Record<JobFilter, number> = {
    all: rows.length,
    "to-send": 0,
    waiting: 0,
    booked: 0,
    unpaid: 0,
    done: 0,
  };
  for (const row of rows) if (row.filter) counts[row.filter] += 1;
  return counts;
}

// ── The old lists, in the new look and back ─────────────────────────────────

/** /app/quotes?stage=… (old dashboard tiles, the agents page) → a Jobs filter. */
export function jobsFilterForQuoteStage(stage: string | null | undefined): JobFilter {
  switch (stage) {
    case "draft":
      return "to-send";
    case "sent":
    case "viewed":
      return "waiting";
    case "accepted":
    case "scheduled":
    case "in_progress":
      return "booked";
    case "completed":
      // Finished work is what gets invoiced; the paid ones are under Done.
      return "unpaid";
    default:
      return "all";
  }
}

/** /app/invoices?status=… → Done for paid, Unpaid for everything else. */
export function jobsFilterForInvoiceStatus(status: string | null | undefined): JobFilter {
  return status === "paid" ? "done" : "unpaid";
}

/** With the new look off, /app/jobs hands over to the old list that fits. */
export function oldLookHrefForJobs(filter: JobFilter): string {
  switch (filter) {
    case "to-send":
      return "/app/quotes?stage=draft";
    case "unpaid":
      return "/app/invoices";
    case "done":
      return "/app/invoices?status=paid";
    default:
      return "/app/quotes";
  }
}

// ── Colour and counts (new look round two) ──────────────────────────────────

/** Each filter's colour (IconTone meanings): quotes to send orange, waiting amber, booked blue, unpaid red, paid green. */
export const FILTER_TONE: Readonly<Record<JobFilter, IconTone>> = {
  all: "neutral",
  "to-send": "brand",
  waiting: "warn",
  booked: "info",
  unpaid: "bad",
  done: "ok",
};

/** Up to two capital letters for a client ("Hemi Walker" → "HW"); "?" with no name. */
export function clientInitials(client: string): string {
  if (!client.trim() || client === NO_CLIENT_NAME) return "?";
  const words = client
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words.slice(0, 1);
  const out = letters.map((w) => [...w][0] ?? "").join("").toLocaleUpperCase();
  return out || "?";
}

const CLIENT_TONES: readonly IconTone[] = ["violet", "info", "ok", "warn", "brand"];

/** A steady colour per client name, so the same client always looks the same. */
export function clientTone(client: string): IconTone {
  if (!client.trim() || client === NO_CLIENT_NAME) return "neutral";
  let hash = 0;
  for (const ch of client.toLocaleLowerCase()) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return CLIENT_TONES[hash % CLIENT_TONES.length];
}

// ── Deleting and restoring jobs (select mode, Recently deleted) ─────────────
//
// Deleting a job soft-deletes its quote and every invoice of it in one go,
// all stamped with the same time, so the job never counts in a total or a
// to-do while it is gone. Restoring it brings back the quote and the
// invoices deleted with it (same time, give or take a few seconds); an
// invoice deleted on its own earlier stays deleted.

/** Most jobs one delete or restore takes (the server actions refuse more). */
export const JOBS_ACTION_LIMIT = 200;
/** Recently deleted lists the jobs deleted in the last this-many days. */
export const DELETED_JOBS_DAYS = 90;
/** An invoice deleted this close to its quote went with it, and comes back with it. */
export const CO_DELETED_WITHIN_MS = 5_000;
/** `?show=deleted` opens Recently deleted. */
export const DELETED_SHOW = "deleted";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type JobIdsCheck = { ok: true; ids: string[] } | { ok: false; error: string };

/**
 * The job (quote) ids a delete or restore was sent, checked: real ids,
 * each once, lower case, and no more than JOBS_ACTION_LIMIT.
 */
export function parseJobIds(input: unknown): JobIdsCheck {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "Pick at least one job first." };
  }
  if (input.length > JOBS_ACTION_LIMIT) {
    return { ok: false, error: `Pick up to ${JOBS_ACTION_LIMIT} jobs at a time.` };
  }
  const ids = new Set<string>();
  for (const value of input) {
    const id = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!UUID_PATTERN.test(id)) {
      return { ok: false, error: "Some of those jobs couldn't be found. Refresh the page and try again." };
    }
    ids.add(id);
  }
  return { ok: true, ids: [...ids] };
}

/** True when an invoice was deleted together with its quote (within a few seconds). */
export function deletedTogether(
  quoteDeletedAt: string | null | undefined,
  invoiceDeletedAt: string | null | undefined,
): boolean {
  const a = ms(quoteDeletedAt);
  const b = ms(invoiceDeletedAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= CO_DELETED_WITHIN_MS;
}

/** A deleted job's quote, as Recently deleted reads it. */
export interface DeletedQuote extends BoardQuote {
  deletedAt: string;
}

/** An invoice with its delete time (null: not deleted). */
export interface DeletedInvoice extends BoardInvoice {
  deletedAt: string | null;
}

/** A row in Recently deleted: the job as it was, and when it went. */
export interface DeletedJobRow extends JobRow {
  deletedAt: string;
  /** "Deleted today", "Deleted yesterday", "Deleted 4 days ago". */
  deletedLabel: string;
}

function deletedLabel(deletedAt: string, now: Date, timeZone: string): string {
  const t = ms(deletedAt);
  if (Number.isNaN(t)) return "Deleted";
  const days = daysBetweenKeys(dayKeyInZone(new Date(t), timeZone), dayKeyInZone(now, timeZone));
  return days === null ? "Deleted" : `Deleted ${agoText(days)}`;
}

/**
 * Recently deleted, newest deletion first. Each job shows the pill and
 * amount it would come back with: its invoices deleted with it, plus any
 * that were never deleted. Invoices deleted on their own are left out
 * (restoring the job doesn't bring them back).
 */
export function buildDeletedJobRows(
  quotes: readonly DeletedQuote[],
  invoices: ReadonlyArray<BoardInvoice & { deletedAt?: string | null }>,
  now: Date,
  timeZone: string,
): DeletedJobRow[] {
  const deletedAt = new Map(quotes.map((q) => [q.id, q.deletedAt]));
  const comesBack = invoices.filter((invoice) => {
    const quoteDeletedAt = deletedAt.get(invoice.quoteId);
    if (quoteDeletedAt === undefined) return false;
    return !invoice.deletedAt || deletedTogether(quoteDeletedAt, invoice.deletedAt);
  });
  return buildJobRows(quotes, comesBack, now, timeZone)
    .map((row) => {
      const at = deletedAt.get(row.id) ?? "";
      return { ...row, deletedAt: at, deletedLabel: deletedLabel(at, now, timeZone) };
    })
    .sort((a, b) => asc(ms(b.deletedAt), ms(a.deletedAt)));
}

const BILLED: ReadonlySet<InvoiceStatus> = new Set(["sent", "overdue", "paid"]);

/** The client has been sent this invoice, or has paid it. */
export function isBilledInvoice(status: InvoiceStatus | null | undefined): boolean {
  return status ? BILLED.has(status) : false;
}

export interface DeleteJobsCopy {
  title: string;
  body: string;
  /** Some have invoices the client has been sent or has paid. */
  billed: string | null;
  /** Clients may hold links that stop working. */
  links: string | null;
  confirm: string;
  keep: string;
}

/** The words of the "Delete 3 jobs?" check, for the jobs picked. */
export function deleteJobsCopy(rows: ReadonlyArray<Pick<JobRow, "invoiceStatus" | "sentToClient">>): DeleteJobsCopy {
  const n = rows.length;
  const one = n === 1;
  const billed = rows.filter((row) => isBilledInvoice(row.invoiceStatus)).length;
  const shared = billed > 0 || rows.some((row) => row.sentToClient);
  let billedLine: string | null = null;
  if (billed > 0) {
    if (one) billedLine = "It has an invoice you've already sent or been paid for.";
    else if (billed === 1) billedLine = "1 has an invoice you've already sent or been paid for.";
    else if (billed === n) billedLine = `${n === 2 ? "Both" : `All ${n}`} have invoices you've already sent or been paid for.`;
    else billedLine = `${billed} have invoices you've already sent or been paid for.`;
  }
  return {
    title: one ? "Delete this job?" : `Delete ${n} jobs?`,
    body: one
      ? "It's removed from Jobs and your totals. You can restore it from Recently deleted."
      : "They're removed from Jobs and your totals. You can restore them from Recently deleted.",
    billed: billedLine,
    links: shared
      ? one
        ? "Your client can't open this quote any more."
        : "Clients can't open these quotes any more."
      : null,
    confirm: `Delete ${countOf(n, "job")}`,
    keep: one ? "Keep it" : "Keep them",
  };
}
