"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Archive as ArchiveIcon,
  MagnifyingGlass,
  Plus,
} from "@phosphor-icons/react";
import {
  displayClientName,
  formatCurrency,
  formatIssueDate,
} from "@/lib/quote-defaults";
import type { QuoteStatus } from "@/lib/quote-types";
import { QuoteRowActions } from "./QuoteRowActions";

/**
 * Client-side controller for the dashboard / quote-list views.
 *
 * Props arrive as the first page of rows from the server (up to PAGE_SIZE+1
 * so we know whether more exist). All further pagination is fetched via a
 * lightweight client fetch through `/app/quotes` server actions — but for
 * v1 we render whatever the server gave us and ask the user to refresh
 * for new data. The current Load-more pattern simply pages through the
 * already-loaded `rows` array (server gives 50, we show 10 at a time).
 *
 * Search and filter are pure client-side filters over the rows array —
 * fast, no network, and "good enough" for users with <500 quotes. Beyond
 * that, the next wave should push search down to Postgres.
 *
 * Wave 10 — soft-delete + archive. Server already excludes `deleted_at IS
 * NOT NULL`; this component only chooses between "active" and "archived"
 * via the `viewMode` prop derived from the active filter tab.
 */
const PAGE_SIZE = 10;

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: "border-ink-600 bg-ink-800 text-ink-300",
  sent: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  viewed: "border-hivis/40 bg-hivis/10 text-hivis",
  accepted: "border-brand/40 bg-brand/10 text-brand",
  // Wave 13 — lifecycle stages past acceptance.
  scheduled: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  in_progress: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  completed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  declined: "border-red-500/40 bg-red-500/10 text-red-300",
  expired: "border-ink-600 bg-ink-800 text-ink-400",
};

/**
 * Wave 11 — added the Declined filter. "Ready" is intentionally NOT a
 * separate filter; the readiness state is a soft UI signal computed in
 * `lib/quote-readiness.ts` and surfaced inside the quote preview, not
 * a database status. Adding a real "Ready" enum value would require a
 * `quote_status` enum migration, which Wave 11 deliberately skips —
 * see commit message for rationale.
 */
const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "declined", label: "Declined" },
  { id: "archived", label: "Archived" },
] as const;

type FilterId = (typeof STATUS_FILTERS)[number]["id"];

export interface QuoteListRow {
  id: string;
  status: QuoteStatus;
  total: number;
  currency: string;
  clientName: string;
  jobSummary: string;
  number: string;
  created_at: string;
  archived_at: string | null;
}

interface Props {
  rows: QuoteListRow[];
  /** True when this client is rendered on `/app/quotes` (the full hub)
   *  vs the `/app` dashboard (compact recent list). */
  isHub?: boolean;
}

export function QuotesListClient({ rows, isHub = false }: Props) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [, startTransition] = useTransition();

  // Reset visible-count when the user changes filter or search.
  useEffect(() => {
    startTransition(() => setVisible(PAGE_SIZE));
  }, [filter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      // Filter tab — Archived shows only archived; everything else hides
      // archived rows and (when status-specific) requires the status.
      if (filter === "archived") {
        if (!row.archived_at) return false;
      } else if (filter !== "all") {
        if (row.archived_at) return false;
        if (row.status !== filter) return false;
      } else {
        if (row.archived_at) return false;
      }
      if (q.length === 0) return true;
      const haystack = [
        row.number,
        row.clientName,
        row.jobSummary,
      ]
        .join(" · ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, filter, search]);

  const slice = filtered.slice(0, visible);
  const hasMore = filtered.length > slice.length;

  return (
    <div data-testid="quotes-list-client" className="space-y-5">
      {/* Search + new-quote affordance */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <span className="sr-only">Search quotes</span>
          <MagnifyingGlass
            size={16}
            weight="bold"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search quote #, client, or job"
            data-testid="quotes-search"
            className="h-11 w-full rounded-sm border border-ink-600 bg-ink-800 pl-9 pr-3 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>
        {isHub ? (
          <Link
            href="/app/quotes/new"
            data-testid="quotes-new-quote"
            className="t2q-btn-primary-pro inline-flex h-11 items-center justify-center gap-2 px-5"
          >
            <Plus size={18} weight="bold" />
            New quote
          </Link>
        ) : null}
      </div>

      {/* Status filter tabs */}
      <div
        role="tablist"
        aria-label="Filter quotes by status"
        data-testid="quotes-filter-tabs"
        className="-mx-1 flex flex-wrap gap-1 overflow-x-auto"
      >
        {STATUS_FILTERS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`quotes-filter-${tab.id}`}
              onClick={() => setFilter(tab.id)}
              className={
                active
                  ? "inline-flex h-11 items-center rounded-sm border border-brand bg-brand/15 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-brand"
                  : "inline-flex h-11 items-center rounded-sm border border-ink-700 bg-ink-900 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 transition-colors hover:border-ink-500 hover:text-white"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Result count + visible window */}
      <p
        data-testid="quotes-count"
        className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-500"
      >
        {filtered.length === 0
          ? `// ${filter === "archived" ? "no archived quotes" : "no quotes match"}`
          : `// showing ${slice.length} of ${filtered.length} ${filter === "archived" ? "archived" : "quote" + (filtered.length === 1 ? "" : "s")}`}
      </p>

      {/* Empty / list */}
      {slice.length === 0 ? (
        <EmptyState filter={filter} search={search} />
      ) : (
        <ul className="space-y-2">
          {slice.map((q) => (
            <li
              key={q.id}
              data-testid={`quote-row-${q.id}`}
              className="t2q-card-pro t2q-card-pro-hover relative"
            >
              <div className="flex items-stretch gap-2 p-3">
                <Link
                  href={`/app/quotes/preview/${q.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
                        {q.number}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${STATUS_STYLES[q.status]}`}
                      >
                        {q.status}
                      </span>
                      {q.archived_at ? (
                        <span className="inline-flex items-center gap-1 rounded-sm border border-ink-600 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                          <ArchiveIcon size={10} weight="bold" />
                          archived
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate font-display text-sm uppercase tracking-tight text-white">
                      {/* Wave 14.4 — collapses "To be confirmed" /
                          TBC / blank to a single em-dash. */}
                      {displayClientName(q.clientName)}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
                      {formatIssueDate(q.created_at)}
                      {q.jobSummary ? ` · ${q.jobSummary.slice(0, 80)}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-lg tabular-nums text-brand">
                      {formatCurrency(q.total, q.currency)}
                    </p>
                  </div>
                </Link>
                <QuoteRowActions
                  quoteId={q.id}
                  isArchived={!!q.archived_at}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Load more */}
      {hasMore ? (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            data-testid="quotes-load-more"
            onClick={() => setVisible((n) => n + PAGE_SIZE)}
            className="t2q-btn-ghost-pro inline-flex h-11 items-center justify-center px-5"
          >
            Load {Math.min(PAGE_SIZE, filtered.length - slice.length)} more
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmptyState({ filter, search }: { filter: FilterId; search: string }) {
  if (search.trim().length > 0) {
    return (
      <p
        data-testid="quotes-empty"
        className="rounded-sm border border-dashed border-ink-700 bg-ink-800/40 p-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        {`// nothing matches "${search.slice(0, 40)}"`}
      </p>
    );
  }
  if (filter === "archived") {
    return (
      <p
        data-testid="quotes-empty"
        className="rounded-sm border border-dashed border-ink-700 bg-ink-800/40 p-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
      >
        {"// no archived quotes yet"}
      </p>
    );
  }
  return (
    <p
      data-testid="quotes-empty"
      className="rounded-sm border border-dashed border-ink-700 bg-ink-800/40 p-8 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-400"
    >
      {filter === "all"
        ? "// no quotes yet — start with new quote"
        : `// no ${filter} quotes`}
    </p>
  );
}
