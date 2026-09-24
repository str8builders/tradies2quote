"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Briefcase, MagnifyingGlass, Plus } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { NEW_QUOTE_PATH } from "../../_v2/lib/app-nav";
import { countOf } from "../../_v2/lib/dates";
import {
  matchesSearch,
  normalizeSearch,
  parseJobFilter,
  rowsForFilter,
  type JobFilter,
  type JobRow,
  type StageFilter,
} from "../../_v2/lib/job-board";
import { FilterChips } from "./FilterChips";

/** Rows shown at first, and added by each "Show more". */
export const JOBS_PAGE_SIZE = 25;

const EMPTY: Readonly<Record<StageFilter, { title: string; body: string }>> = {
  "to-send": { title: "Nothing to send", body: "Every quote has gone out." },
  waiting: { title: "Nobody to chase", body: "No quotes are waiting on an answer." },
  booked: { title: "Nothing booked", body: "Accepted jobs show up here until they're done." },
  unpaid: { title: "Nothing unpaid", body: "Every finished job is paid." },
  done: { title: "Nothing paid yet", body: "Jobs land here once they're paid." },
};

/** Keep the filter and search in the address, so Back returns to the same list. */
function writeUrl(filter: JobFilter, query: string): void {
  const params = new URLSearchParams(window.location.search);
  if (filter === "all") params.delete("show");
  else params.set("show", filter);
  const q = normalizeSearch(query);
  if (q) params.set("q", q);
  else params.delete("q");
  const search = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}

function JobRowItem({ row }: { row: JobRow }) {
  return (
    <ListRow
      href={row.href}
      title={row.client}
      subtitle={
        <>
          {row.job ? <span className="block truncate">{row.job}</span> : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusPill tone={row.pill.tone}>{row.pill.text}</StatusPill>
            {row.archived ? <span className="text-ui-xs text-ui-faint">Archived</span> : null}
          </span>
        </>
      }
      trailing={row.amount > 0 ? <Money amount={row.amount} currency={row.currency} /> : undefined}
    />
  );
}

/**
 * The Jobs list: every quote with its invoice folded in, filtered and
 * searched on the phone (no round trip per tap), longest lists paged.
 * Each row opens the job page.
 */
export function JobsBrowser({ rows }: { rows: JobRow[] }) {
  const searchParams = useSearchParams();
  const urlFilter = parseJobFilter(searchParams?.get("show"));
  const [filter, setFilter] = useState<JobFilter>(urlFilter);
  const [seenUrlFilter, setSeenUrlFilter] = useState<JobFilter>(urlFilter);
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "");
  const [shown, setShown] = useState(JOBS_PAGE_SIZE);

  // A link from elsewhere changed ?show= while this list stayed on screen
  // (the tab bar, a Home tile): follow it.
  if (urlFilter !== seenUrlFilter) {
    setSeenUrlFilter(urlFilter);
    setFilter(urlFilter);
    setShown(JOBS_PAGE_SIZE);
  }

  const inFilter = useMemo(() => rowsForFilter(rows, filter), [rows, filter]);
  const matches = useMemo(() => inFilter.filter((row) => matchesSearch(row, query)), [inFilter, query]);
  const visible = matches.slice(0, shown);
  const searching = normalizeSearch(query).length > 0;

  const pick = (next: JobFilter) => {
    setFilter(next);
    setShown(JOBS_PAGE_SIZE);
    writeUrl(next, query);
  };
  const search = (next: string) => {
    setQuery(next);
    setShown(JOBS_PAGE_SIZE);
    writeUrl(filter, next);
  };

  const summary = searching
    ? `${countOf(matches.length, "job")} ${matches.length === 1 ? "matches" : "match"} “${query.trim()}”`
    : countOf(matches.length, "job");

  return (
    <div className="mt-5 space-y-4">
      <TextField
        type="search"
        label="Search jobs"
        labelHidden
        placeholder="Client or job"
        value={query}
        onChange={(event) => search(event.target.value)}
        prefix={<MagnifyingGlass aria-hidden="true" weight="bold" />}
        enterKeyHint="search"
        autoComplete="off"
      />
      <FilterChips value={filter} onChange={pick} />
      <p aria-live="polite" data-testid="jobs-count" className="text-ui-sm text-ui-muted">
        {summary}
      </p>

      {visible.length > 0 ? (
        <Card padding="none">
          <ul data-testid="jobs-list" className="divide-y divide-ui-line">
            {visible.map((row) => (
              <li key={row.id}>
                <JobRowItem row={row} />
              </li>
            ))}
          </ul>
        </Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase weight="bold" />}
          title="No jobs yet"
          action={
            <ButtonLink href={NEW_QUOTE_PATH} icon={<Plus weight="bold" />} fullWidth>
              New quote
            </ButtonLink>
          }
        >
          Make a quote and it shows up here, all the way to paid.
        </EmptyState>
      ) : searching ? (
        <EmptyState
          title={`No jobs match “${query.trim()}”`}
          action={
            <>
              <Button variant="secondary" fullWidth onClick={() => search("")}>
                Clear search
              </Button>
              {filter !== "all" ? (
                <Button variant="ghost" fullWidth onClick={() => pick("all")}>
                  Search all jobs
                </Button>
              ) : null}
            </>
          }
        >
          Try a client&apos;s name or a word from the job.
        </EmptyState>
      ) : filter !== "all" ? (
        <EmptyState
          title={EMPTY[filter].title}
          action={
            <Button variant="secondary" fullWidth onClick={() => pick("all")}>
              Show all jobs
            </Button>
          }
        >
          {EMPTY[filter].body}
        </EmptyState>
      ) : null}

      {matches.length > shown ? (
        <Button variant="secondary" fullWidth onClick={() => setShown((n) => n + JOBS_PAGE_SIZE)}>
          Show {Math.min(JOBS_PAGE_SIZE, matches.length - shown)} more
        </Button>
      ) : null}
    </div>
  );
}
