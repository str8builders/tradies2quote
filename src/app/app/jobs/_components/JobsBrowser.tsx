"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  Briefcase,
  CheckSquare,
  MagnifyingGlass,
  Plus,
  Square,
  Trash,
} from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import { TextField } from "@/components/ui/text-field";
import { NEW_QUOTE_PATH } from "../../_v2/lib/app-nav";
import { countOf } from "../../_v2/lib/dates";
import { cx } from "@/components/ui/cx";
import { TAP, TONE_STRIPE } from "@/components/ui/styles";
import {
  DELETED_JOBS_DAYS,
  DELETED_SHOW,
  FILTER_TONE,
  JOBS_ACTION_LIMIT,
  JOBS_PATH,
  JOB_FILTERS,
  clientInitials,
  clientTone,
  filterCounts,
  matchesSearch,
  normalizeSearch,
  parseJobFilter,
  rowsForFilter,
  type DeletedJobRow,
  type JobFilter,
  type JobRow,
  type StageFilter,
} from "../../_v2/lib/job-board";
import { deleteJobs, restoreJobs, type JobsActionResult } from "../actions";
import { DeleteJobsSheet } from "./DeleteJobsSheet";
import { FilterChips } from "./FilterChips";
import { JobsNotice, SelectBar, type JobsNoticeData } from "./SelectBars";

/** Rows shown at first, and added by each "Show more". */
export const JOBS_PAGE_SIZE = 25;

const EMPTY: Readonly<Record<StageFilter, { title: string; body: string }>> = {
  "to-send": { title: "Nothing to send", body: "Every quote has gone out." },
  waiting: { title: "Nobody to chase", body: "No quotes are waiting on an answer." },
  booked: { title: "Nothing booked", body: "Accepted jobs show up here until they're done." },
  unpaid: { title: "Nothing unpaid", body: "Every finished job is paid." },
  done: { title: "Nothing paid yet", body: "Jobs land here once they're paid." },
};

const NO_SIGNAL = "No connection. Check your signal and try again.";

/** The whole job list, or Recently deleted (`?show=deleted`). */
type View = "jobs" | "deleted";

/** Keep the filter and search in the address, so Back returns to the same list. */
function writeUrl(filter: JobFilter, query: string, view: View = "jobs"): void {
  const params = new URLSearchParams(window.location.search);
  if (view === "deleted") params.set("show", DELETED_SHOW);
  else if (filter === "all") params.delete("show");
  else params.set("show", filter);
  const q = normalizeSearch(query);
  if (q) params.set("q", q);
  else params.delete("q");
  const search = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
}

/** A server action, with a dropped connection turned into plain words. */
async function attempt(action: () => Promise<JobsActionResult>): Promise<JobsActionResult> {
  try {
    return await action();
  } catch {
    return { ok: false, error: NO_SIGNAL };
  }
}

function restoredMessage(count: number): string {
  return count === 0 ? "Nothing to restore. They're already back." : `${countOf(count, "job")} restored`;
}

/**
 * Where the jobs are, as one bar in the filter colours, with the counts in
 * words underneath (the bar alone is never the only way to read it).
 */
export function StageBar({ counts }: { counts: Readonly<Record<JobFilter, number>> }) {
  const stages = JOB_FILTERS.filter((f) => f.id !== "all" && counts[f.id] > 0);
  const total = stages.reduce((sum, f) => sum + counts[f.id], 0);
  if (total === 0) return null;
  return (
    <section aria-label="Where your jobs are" data-testid="jobs-stage-bar" className="space-y-2">
      <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {stages.map((f) => (
          <span key={f.id} className={TONE_STRIPE[FILTER_TONE[f.id]]} style={{ flexGrow: counts[f.id] }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-ui-xs text-ui-muted">
        {stages.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cx("h-2 w-2 rounded-full", TONE_STRIPE[FILTER_TONE[f.id]])} />
            {counts[f.id]} {f.label.toLocaleLowerCase()}
          </span>
        ))}
      </p>
    </section>
  );
}

function isDeletedRow(row: JobRow | DeletedJobRow): row is DeletedJobRow {
  return "deletedLabel" in row;
}

/** The job in one line, its status in words, and Archived or when it was deleted. */
function RowDetails({ row }: { row: JobRow | DeletedJobRow }) {
  return (
    <>
      {row.job ? <span className="block truncate">{row.job}</span> : null}
      <span className="mt-1.5 flex flex-wrap items-center gap-2">
        <StatusPill tone={row.pill.tone}>{row.pill.text}</StatusPill>
        {row.archived ? <span className="text-ui-xs text-ui-muted">Archived</span> : null}
        {isDeletedRow(row) ? <span className="text-ui-xs text-ui-muted">{row.deletedLabel}</span> : null}
      </span>
    </>
  );
}

function amountOf(row: JobRow) {
  return row.amount > 0 ? <Money amount={row.amount} currency={row.currency} /> : undefined;
}

function initialsOf(row: JobRow) {
  return <span className="text-ui-sm font-bold">{clientInitials(row.client)}</span>;
}

function JobRowItem({ row }: { row: JobRow }) {
  return (
    <ListRow
      href={row.href}
      icon={initialsOf(row)}
      iconTone={clientTone(row.client)}
      title={row.client}
      subtitle={<RowDetails row={row} />}
      trailing={amountOf(row)}
    />
  );
}

/**
 * A row in select mode: the whole row is one tick box (never a box inside
 * a link). Space or Enter ticks it from the keyboard.
 */
function JobCheckRow({
  row,
  checked,
  disabled,
  onToggle,
}: {
  row: JobRow;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}) {
  const toggle = () => {
    if (!disabled) onToggle(row.id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    toggle();
  };
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      tabIndex={0}
      data-testid="job-select-row"
      data-job={row.id}
      onClick={toggle}
      onKeyDown={onKeyDown}
      className={cx(
        "ui-focus-ring block",
        TAP,
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-ui-brand-soft" : !disabled && "hover:bg-ui-surface-2",
      )}
    >
      <ListRow
        icon={checked ? <CheckSquare weight="fill" /> : <Square weight="bold" />}
        iconTone={checked ? "brand" : "neutral"}
        title={row.client}
        subtitle={<RowDetails row={row} />}
        trailing={amountOf(row)}
      />
    </div>
  );
}

/** A row in Recently deleted: no job page to open, a Restore button instead. */
function DeletedRowItem({
  row,
  busy,
  restoring,
  onRestore,
}: {
  row: DeletedJobRow;
  busy: boolean;
  restoring: boolean;
  onRestore: (id: string) => void;
}) {
  return (
    <ListRow
      icon={initialsOf(row)}
      iconTone={clientTone(row.client)}
      title={row.client}
      subtitle={<RowDetails row={row} />}
      trailing={
        <span className="flex flex-col items-end gap-2">
          {amountOf(row)}
          <Button
            variant="secondary"
            size="sm"
            icon={<ArrowCounterClockwise weight="bold" />}
            loading={restoring}
            loadingLabel="Restoring…"
            disabled={busy && !restoring}
            aria-label={`Restore ${row.client}${row.job ? `, ${row.job}` : ""}`}
            onClick={() => onRestore(row.id)}
          >
            Restore
          </Button>
        </span>
      }
    />
  );
}

/**
 * The rows, as links to each job page; as tick boxes in select mode; or,
 * in Recently deleted, with a Restore button each.
 */
export function JobsList({
  rows,
  selecting = false,
  selected,
  atLimit = false,
  busy = false,
  restoringId = null,
  onToggle,
  onRestore,
}: {
  rows: ReadonlyArray<JobRow | DeletedJobRow>;
  selecting?: boolean;
  selected?: ReadonlySet<string>;
  /** The most one go takes is ticked: the rest can't be. */
  atLimit?: boolean;
  busy?: boolean;
  restoringId?: string | null;
  onToggle?: (id: string) => void;
  onRestore?: (id: string) => void;
}) {
  return (
    <Card padding="none">
      <ul data-testid="jobs-list" className="divide-y divide-ui-line">
        {rows.map((row) => {
          const checked = selected?.has(row.id) ?? false;
          return (
            <li key={row.id}>
              {selecting ? (
                <JobCheckRow
                  row={row}
                  checked={checked}
                  disabled={busy || (!checked && atLimit)}
                  onToggle={onToggle ?? (() => {})}
                />
              ) : isDeletedRow(row) ? (
                <DeletedRowItem
                  row={row}
                  busy={busy}
                  restoring={restoringId === row.id}
                  onRestore={onRestore ?? (() => {})}
                />
              ) : (
                <JobRowItem row={row} />
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** The way into Recently deleted, under the list. */
function DeletedEntry({ count, onOpen }: { count: number | null; onOpen: () => void }) {
  return (
    <div data-testid="jobs-deleted-entry">
      <Card padding="none">
        <ListRow
          onClick={onOpen}
          icon={<Trash weight="duotone" />}
          title="Recently deleted"
          subtitle={
            count === null
              ? `Jobs you deleted in the last ${DELETED_JOBS_DAYS} days`
              : `${countOf(count, "job")} from the last ${DELETED_JOBS_DAYS} days`
          }
        />
      </Card>
    </div>
  );
}

/**
 * The Jobs list: every quote with its invoice folded in, filtered and
 * searched on the phone (no round trip per tap), longest lists paged.
 * Each row opens the job page. "Select" turns the rows into tick boxes to
 * delete jobs (after a check); Recently deleted, under the list, brings
 * them back. `deleted`: the jobs deleted lately (null when they couldn't
 * be read; left out, there is no Recently deleted).
 */
export function JobsBrowser({ rows, deleted }: { rows: JobRow[]; deleted?: DeletedJobRow[] | null }) {
  const searchParams = useSearchParams();
  const urlShow = searchParams?.get("show") ?? null;
  const hasDeleted = deleted !== undefined;
  const urlView: View = hasDeleted && urlShow === DELETED_SHOW ? "deleted" : "jobs";
  const urlFilter = parseJobFilter(urlShow);
  const [filter, setFilter] = useState<JobFilter>(urlFilter);
  const [view, setView] = useState<View>(urlView);
  const [seenShow, setSeenShow] = useState(urlShow);
  const [query, setQuery] = useState(() => searchParams?.get("q") ?? "");
  const [shown, setShown] = useState(JOBS_PAGE_SIZE);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [barError, setBarError] = useState<string | null>(null);
  const [notice, setNotice] = useState<JobsNoticeData | null>(null);
  const noticeSeq = useRef(0);

  // A link from elsewhere changed ?show= while this list stayed on screen
  // (the tab bar, a Home tile): follow it. A new list starts a new selection.
  if (urlShow !== seenShow) {
    setSeenShow(urlShow);
    if (urlView === "jobs") setFilter(urlFilter);
    if (urlView !== view) setSelecting(false);
    setView(urlView);
    setShown(JOBS_PAGE_SIZE);
    setSelected(new Set());
  }

  const deletedRows = useMemo<DeletedJobRow[]>(() => deleted ?? [], [deleted]);
  const counts = useMemo(() => filterCounts(rows), [rows]);
  const inView = useMemo<ReadonlyArray<JobRow | DeletedJobRow>>(
    () => (view === "deleted" ? deletedRows : rowsForFilter(rows, filter)),
    [view, deletedRows, rows, filter],
  );
  const matches = useMemo(() => inView.filter((row) => matchesSearch(row, query)), [inView, query]);
  const visible = matches.slice(0, shown);
  const searching = normalizeSearch(query).length > 0;

  // What a delete or restore acts on: the ticked rows this list shows.
  const chosen = matches.filter((row) => selected.has(row.id));
  const pickable = matches.slice(0, JOBS_ACTION_LIMIT);
  const allChosen = pickable.length > 0 && pickable.every((row) => selected.has(row.id));
  const atLimit = chosen.length >= JOBS_ACTION_LIMIT;

  const say = (next: Omit<JobsNoticeData, "id">) => {
    noticeSeq.current += 1;
    setNotice({ ...next, id: noticeSeq.current });
  };

  const pick = (next: JobFilter) => {
    setFilter(next);
    setShown(JOBS_PAGE_SIZE);
    setSelected(new Set());
    writeUrl(next, query);
  };
  const search = (next: string) => {
    setQuery(next);
    setShown(JOBS_PAGE_SIZE);
    writeUrl(filter, next, view);
  };
  const openView = (next: View) => {
    setView(next);
    setShown(JOBS_PAGE_SIZE);
    setSelecting(false);
    setSelected(new Set());
    writeUrl(filter, query, next);
  };
  const startSelecting = () => {
    setSelecting(true);
    setSelected(new Set());
    setBarError(null);
    setNotice(null);
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
    setBarError(null);
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else if (atLimit) return;
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => setSelected(allChosen ? new Set() : new Set(pickable.map((row) => row.id)));

  const askDelete = () => {
    if (chosen.length === 0) return;
    setSheetError(null);
    setConfirming(true);
  };
  const confirmDelete = async () => {
    const ids = chosen.map((row) => row.id);
    if (ids.length === 0) return;
    setBusy(true);
    setSheetError(null);
    const result = await attempt(() => deleteJobs(ids));
    setBusy(false);
    if (!result.ok) {
      setSheetError(result.error);
      return;
    }
    setConfirming(false);
    stopSelecting();
    if (result.count === 0) say({ tone: "info", message: "Those jobs were already deleted" });
    else say({ tone: "info", message: `${countOf(result.count, "job")} deleted`, undo: result.ids });
  };
  const undo = async (ids: readonly string[]) => {
    setBusy(true);
    const result = await attempt(() => restoreJobs([...ids]));
    setBusy(false);
    if (result.ok) say({ tone: "ok", message: restoredMessage(result.count) });
    else say({ tone: "bad", message: result.error, undo: ids });
  };
  /** Restore one row (its own button) or the ticked ones (the select bar). */
  const restore = async (ids: string[], one: string | null = null) => {
    if (ids.length === 0) return;
    setBusy(true);
    setRestoringId(one);
    setBarError(null);
    setNotice(null);
    const result = await attempt(() => restoreJobs(ids));
    setBusy(false);
    setRestoringId(null);
    if (!result.ok) {
      // From the select bar the message stays on the bar, with the ticks kept.
      if (one === null) setBarError(result.error);
      else say({ tone: "bad", message: result.error });
      return;
    }
    stopSelecting();
    say({ tone: "ok", message: restoredMessage(result.count) });
  };

  const summary = selecting
    ? chosen.length === 0
      ? "Tap jobs to select them"
      : `${chosen.length} of ${countOf(matches.length, "job")} selected`
    : searching
      ? `${countOf(matches.length, "job")} ${matches.length === 1 ? "matches" : "match"} “${query.trim()}”`
      : countOf(matches.length, "job");
  const showBar = selecting && chosen.length > 0;

  return (
    <div className="mt-5 space-y-4">
      {view === "deleted" ? (
        <section data-testid="jobs-deleted-view" className="space-y-2">
          <Button variant="ghost" size="sm" icon={<ArrowLeft weight="bold" />} onClick={() => openView("jobs")}>
            Back to jobs
          </Button>
          <h2 className="ui-title text-ui-lg text-ui-text">Recently deleted</h2>
          <p className="text-ui-sm text-ui-muted">
            Jobs you deleted in the last {DELETED_JOBS_DAYS} days. Restore one to put it back in Jobs and your totals.
          </p>
        </section>
      ) : null}
      <TextField
        type="search"
        label={view === "deleted" ? "Search deleted jobs" : "Search jobs"}
        labelHidden
        placeholder="Client or job"
        value={query}
        onChange={(event) => search(event.target.value)}
        prefix={<MagnifyingGlass aria-hidden="true" weight="bold" />}
        enterKeyHint="search"
        autoComplete="off"
      />
      {view === "jobs" ? (
        <>
          <StageBar counts={counts} />
          <FilterChips value={filter} onChange={pick} counts={counts} />
        </>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p aria-live="polite" data-testid="jobs-count" className="text-ui-sm text-ui-muted">
          {summary}
        </p>
        {selecting ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" disabled={busy || pickable.length === 0} onClick={toggleAll}>
              {allChosen ? "Clear" : "Select all"}
            </Button>
            <Button variant="secondary" size="sm" disabled={busy} onClick={stopSelecting}>
              Cancel
            </Button>
          </div>
        ) : matches.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<CheckSquare weight="bold" />}
            onClick={startSelecting}
            data-testid="jobs-select"
          >
            Select
          </Button>
        ) : null}
      </div>

      {view === "deleted" && deleted === null ? (
        <Callout
          tone="bad"
          title="Couldn't load your deleted jobs"
          action={
            <ButtonLink href={`${JOBS_PATH}?show=${DELETED_SHOW}`} variant="secondary">
              Try again
            </ButtonLink>
          }
        >
          Check your signal, then try again.
        </Callout>
      ) : visible.length > 0 ? (
        <JobsList
          rows={visible}
          selecting={selecting}
          selected={selected}
          atLimit={atLimit}
          busy={busy}
          restoringId={restoringId}
          onToggle={toggle}
          onRestore={(id) => restore([id], id)}
        />
      ) : view === "deleted" ? (
        searching ? (
          <EmptyState
            title={`No deleted jobs match “${query.trim()}”`}
            action={
              <Button variant="secondary" fullWidth onClick={() => search("")}>
                Clear search
              </Button>
            }
          >
            Try a client&apos;s name or a word from the job.
          </EmptyState>
        ) : (
          <EmptyState
            icon={<Trash weight="duotone" />}
            title="Nothing deleted"
            action={
              <Button variant="secondary" fullWidth onClick={() => openView("jobs")}>
                Back to jobs
              </Button>
            }
          >
            Jobs you delete show here for {DELETED_JOBS_DAYS} days, so you can put them back.
          </EmptyState>
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Briefcase weight="duotone" />}
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

      {view === "jobs" && !selecting && (deleted === null || deletedRows.length > 0) ? (
        <DeletedEntry count={deleted === null ? null : deletedRows.length} onOpen={() => openView("deleted")} />
      ) : null}

      {showBar ? (
        <SelectBar
          count={chosen.length}
          action={view === "deleted" ? "restore" : "delete"}
          busy={busy}
          error={barError}
          atLimit={atLimit && matches.length > JOBS_ACTION_LIMIT}
          onAction={view === "deleted" ? () => restore(chosen.map((row) => row.id)) : askDelete}
        />
      ) : null}
      <JobsNotice
        notice={selecting ? null : notice}
        busy={busy}
        onUndo={undo}
        onDismiss={() => setNotice(null)}
      />
      {/* Room to scroll the last rows clear of a docked bar. */}
      {showBar || (notice && !selecting) ? (
        <div aria-hidden="true" className={showBar && barError ? "h-44" : "h-28"} />
      ) : null}

      {view === "jobs" ? (
        <DeleteJobsSheet
          open={confirming}
          rows={chosen}
          busy={busy}
          error={sheetError}
          onConfirm={confirmDelete}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}
