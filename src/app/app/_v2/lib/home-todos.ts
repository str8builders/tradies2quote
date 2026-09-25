/**
 * Home: "what needs doing today" (new look). Pure.
 *
 * Built from the same rows as the Jobs board, plus the open client requests
 * the old dashboard counted. Each card says what happened in one line, who
 * and how much, and has ONE action that goes where it's done — normally the
 * job page. Most urgent first:
 *
 *   1. Overdue invoices          "Send a reminder"   (money that's late)
 *   2. Client requests waiting   "Check and send"    (new work, speed wins it)
 *   3. Started or finished jobs
 *      without a sent invoice    "Send invoice"
 *   4. Accepted, not booked      "Book the job"
 *   5. Sent 3+ days, no answer   "Follow up"
 *   6. Drafts ready to send      "Check and send"
 *
 * Archived jobs are skipped, except for late invoices: money owed is still
 * owed. A draft made from a client request shows once, as the request.
 */

import type { IconTone } from "@/components/ui/styles";
import { formatCurrency, isPlaceholderClientName, round2 } from "@/lib/quote-defaults";
import { agoText, countOf, daysSince, monthKeyInZone } from "./dates";
import {
  invoiceLateDays,
  jobHref,
  liveInvoicesByQuote,
  type BoardInvoice,
  type BoardQuote,
} from "./job-board";

export interface BoardRequest {
  id: string;
  quoteId: string | null;
  clientName: string | null;
  description: string | null;
  status: string;
  createdAt: string;
}

export type TodoKind = "overdue" | "request" | "invoice" | "book" | "follow_up" | "draft";

export interface Todo {
  key: string;
  kind: TodoKind;
  /** One line: what happened. */
  title: string;
  /** Who, and how much. */
  detail: string;
  action: { label: string; href: string };
  tone: IconTone;
}

/** A sent quote with no answer for this many days gets a follow-up card. */
export const FOLLOW_UP_AFTER_DAYS = 3;
/** quote_requests rows the old dashboard counted as waiting. */
export const OPEN_REQUEST_STATUSES: readonly string[] = ["new", "generated", "generation_failed"];
export const REQUESTS_PATH = "/app/requests";
/** Cards shown before "Show more". */
export const HOME_TODO_LIMIT = 6;

const KIND_ORDER: Readonly<Record<TodoKind, number>> = {
  overdue: 0,
  request: 1,
  invoice: 2,
  book: 3,
  follow_up: 4,
  draft: 5,
};

const TONE: Readonly<Record<TodoKind, IconTone>> = {
  overdue: "bad",
  request: "brand",
  invoice: "ok",
  // Dates are blue (IconTone): booking a job in.
  book: "info",
  follow_up: "warn",
  draft: "brand",
};

function clientOf(name: string | null | undefined): string | null {
  return isPlaceholderClientName(name) ? null : (name as string).trim();
}

function snippet(text: string | null | undefined, max = 60): string | null {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function detailOf(...parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(" · ");
}

function money(amount: number, currency: string): string | null {
  return amount > 0 ? formatCurrency(amount, currency || "NZD") : null;
}

function ms(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

interface Ranked {
  todo: Todo;
  /** Inside a kind, smaller comes first. */
  within: number;
}

function card(
  kind: TodoKind,
  key: string,
  title: string,
  detail: string,
  action: Todo["action"],
): Todo {
  return { key: `${kind}:${key}`, kind, title, detail, action, tone: TONE[kind] };
}

export interface TodoInput {
  quotes: readonly BoardQuote[];
  invoices: readonly BoardInvoice[];
  requests: readonly BoardRequest[];
  now: Date;
  timeZone: string;
}

/** Every to-do card, most urgent first. */
export function buildTodos({ quotes, invoices, requests, now, timeZone }: TodoInput): Todo[] {
  const live = liveInvoicesByQuote(invoices);
  const quoteById = new Map(quotes.map((q) => [q.id, q]));
  const ranked: Ranked[] = [];

  // 1. Late invoices. The job must still exist (a deleted quote has no page).
  for (const invoice of live.values()) {
    const late = invoiceLateDays(invoice, now, timeZone);
    const quote = quoteById.get(invoice.quoteId);
    if (late === null || !quote) continue;
    const amount = formatCurrency(invoice.total, invoice.currency || quote.currency || "NZD");
    ranked.push({
      within: -late,
      todo: card(
        "overdue",
        invoice.id,
        late > 0 ? `${amount} is ${countOf(late, "day")} late` : `${amount} is overdue`,
        detailOf(clientOf(quote.clientName), snippet(quote.jobSummary)) || `Invoice ${invoice.number}`,
        { label: "Send a reminder", href: jobHref(quote.id) },
      ),
    });
  }

  // 2. Client requests still waiting on the tradie: no quote sent for them yet.
  const requestDrafts = new Set<string>();
  for (const request of requests) {
    if (!OPEN_REQUEST_STATUSES.includes(request.status)) continue;
    const client = clientOf(request.clientName);
    if (request.quoteId) {
      const draft = quoteById.get(request.quoteId);
      // Sent on, deleted or archived: dealt with.
      if (!draft || draft.status !== "draft" || draft.archived) continue;
      requestDrafts.add(draft.id);
      ranked.push({
        within: ms(request.createdAt),
        todo: card(
          "request",
          request.id,
          "New job request",
          detailOf(
            client ?? clientOf(draft.clientName),
            money(draft.total, draft.currency) ?? snippet(draft.jobSummary ?? request.description),
          ),
          { label: "Check and send", href: jobHref(draft.id) },
        ),
      });
    } else {
      ranked.push({
        within: ms(request.createdAt),
        todo: card("request", request.id, "New job request", detailOf(client, snippet(request.description)), {
          label: "Open request",
          href: REQUESTS_PATH,
        }),
      });
    }
  }

  // 3–6. The jobs themselves.
  for (const quote of quotes) {
    if (quote.archived) continue;
    const client = clientOf(quote.clientName);
    const total = money(quote.total, quote.currency);
    // Who and how much; the job itself stands in when there is no client name.
    const who = detailOf(client ?? snippet(quote.jobSummary, 40), total) || "No details yet";
    const href = jobHref(quote.id);
    switch (quote.status) {
      case "draft": {
        if (requestDrafts.has(quote.id)) break;
        ranked.push({
          within: -ms(quote.createdAt),
          todo: card("draft", quote.id, "Quote ready to send", who, { label: "Check and send", href }),
        });
        break;
      }
      case "sent":
      case "viewed": {
        const waited = daysSince(quote.sentAt ?? quote.createdAt, now);
        if (waited === null || waited < FOLLOW_UP_AFTER_DAYS) break;
        const wait = countOf(waited, "day");
        ranked.push({
          within: -waited,
          todo: card(
            "follow_up",
            quote.id,
            quote.status === "viewed" ? `Seen, no answer for ${wait}` : `No answer for ${wait}`,
            who,
            { label: "Follow up", href },
          ),
        });
        break;
      }
      case "accepted": {
        const days = daysSince(quote.acceptedAt, now);
        ranked.push({
          within: ms(quote.acceptedAt ?? quote.createdAt),
          todo: card(
            "book",
            quote.id,
            days === null ? "Quote accepted" : `Quote accepted ${agoText(days)}`,
            who,
            { label: "Book the job", href },
          ),
        });
        break;
      }
      case "in_progress": {
        if (live.has(quote.id)) break;
        const days = daysSince(quote.startedAt, now);
        ranked.push({
          // Finished jobs first; started ones after, oldest start first.
          within: 1e15 + ms(quote.startedAt ?? quote.createdAt),
          todo: card(
            "invoice",
            quote.id,
            days === null ? "Job under way" : `Job started ${agoText(days)}`,
            who,
            { label: "Send invoice", href },
          ),
        });
        break;
      }
      case "completed": {
        const invoice = live.get(quote.id);
        if (invoice && invoice.status !== "draft") break;
        const billed = invoice ? money(invoice.total, invoice.currency || quote.currency) : total;
        ranked.push({
          within: ms(quote.completedAt ?? quote.createdAt),
          todo: card(
            "invoice",
            quote.id,
            invoice ? "Invoice not sent yet" : "Job done, not invoiced yet",
            detailOf(client ?? snippet(quote.jobSummary, 40), billed) || "No details yet",
            { label: "Send invoice", href },
          ),
        });
        break;
      }
      default:
        break;
    }
  }

  return ranked
    .sort((a, b) => KIND_ORDER[a.todo.kind] - KIND_ORDER[b.todo.kind] || a.within - b.within)
    .map((r) => r.todo);
}

/** "3 things need you today" / "Nothing needs you right now". */
export function todoSummary(count: number): string {
  if (count === 0) return "Nothing needs you right now";
  return `${countOf(count, "thing")} ${count === 1 ? "needs" : "need"} you today`;
}

// ── Money tiles ──────────────────────────────────────────────────────────────

export interface MoneyTotal {
  amount: number;
  count: number;
  currency: string;
  /** Invoices left out because they are in another currency. */
  otherCurrencies: number;
}

function totalOf(rows: readonly BoardInvoice[], fallbackCurrency: string): MoneyTotal {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const c = row.currency || fallbackCurrency;
    tally.set(c, (tally.get(c) ?? 0) + 1);
  }
  // The currency most of them are in; the business's own on a tie or when empty.
  let currency = fallbackCurrency;
  let best = tally.get(fallbackCurrency) ?? 0;
  for (const [c, n] of tally) {
    if (n > best) {
      currency = c;
      best = n;
    }
  }
  let amount = 0;
  let count = 0;
  for (const row of rows) {
    if ((row.currency || fallbackCurrency) !== currency) continue;
    amount += Number.isFinite(row.total) ? row.total : 0;
    count += 1;
  }
  return { amount: round2(amount), count, currency, otherCurrencies: rows.length - count };
}

/**
 * Owed to you: every sent or overdue invoice. Paid this month: invoices
 * paid since the 1st, in the business's time zone. Cancelled ones never
 * count. Invoices of archived jobs do.
 */
export function moneyTiles({
  invoices,
  now,
  timeZone,
  currency,
}: {
  invoices: readonly BoardInvoice[];
  now: Date;
  timeZone: string;
  currency: string;
}): { owed: MoneyTotal; paidThisMonth: MoneyTotal } {
  const month = monthKeyInZone(now, timeZone);
  const owed = invoices.filter((i) => i.status === "sent" || i.status === "overdue");
  const paid = invoices.filter(
    (i) => i.status === "paid" && !!i.paidAt && monthKeyInZone(new Date(i.paidAt), timeZone) === month,
  );
  const fallback = currency || "NZD";
  return { owed: totalOf(owed, fallback), paidThisMonth: totalOf(paid, fallback) };
}
