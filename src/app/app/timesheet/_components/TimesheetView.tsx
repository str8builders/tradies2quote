"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CaretLeft, CaretRight, Car, LockSimple, MapPin, MapTrifold, Plus, Receipt, Timer } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconTile } from "@/components/ui/icon-tile";
import { StatusPill } from "@/components/ui/status-pill";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { formatHours, formatTime } from "@/lib/timesheet/hours";
import { addDays, dayLabel, weekLabel } from "@/lib/timesheet/week";
import type { LocationState } from "../_lib/location-types";
import { entryPlace } from "../_lib/places";
import type { TimesheetData, TimesheetEntry } from "../_lib/types";
import { forPerson, groupByDay, unbilledByClient, weekTotals } from "../_lib/view";
import { ClockCard } from "./ClockCard";
import { EntrySheet, draftFrom, newDraft, type EntryDraft } from "./EntrySheet";
import { InvoiceWeekSheet } from "./InvoiceWeekSheet";
import { JobLocationSheet } from "./JobLocationSheet";

const weekHref = (start: string) => `/app/timesheet?week=${start}`;

function WeekNav({ weekStart, today }: { weekStart: string; today: string }) {
  const thisWeek = weekStart <= today && today <= addDays(weekStart, 6);
  const arrow = cx("ui-focus-ring inline-flex h-12 w-12 items-center justify-center rounded-ui-md border border-ui-line bg-ui-surface text-[1.25rem] text-ui-text", TAP, PRESS);
  return (
    <nav aria-label="Week" className="flex items-center gap-3" data-testid="timesheet-week-nav">
      <Link href={weekHref(addDays(weekStart, -7))} aria-label="Last week" className={arrow}>
        <CaretLeft aria-hidden="true" weight="bold" />
      </Link>
      <div className="min-w-0 flex-1 text-center">
        <p className="ui-title text-ui-lg text-ui-text">{weekLabel(weekStart)}</p>
        <p className="text-ui-sm text-ui-muted">{thisWeek ? "This week" : <Link href="/app/timesheet" className="text-ui-brand-text underline-offset-4 hover:underline">Back to this week</Link>}</p>
      </div>
      <Link href={weekHref(addDays(weekStart, 7))} aria-label="Next week" className={arrow}>
        <CaretRight aria-hidden="true" weight="bold" />
      </Link>
    </nav>
  );
}

function EntryRow({
  entry,
  onOpen,
  onPlace,
}: {
  entry: TimesheetEntry;
  onOpen: (entry: TimesheetEntry) => void;
  /** Show where the hours were (its own button, so it never opens the edit). */
  onPlace: (entry: TimesheetEntry) => void;
}) {
  const editable = entry.mine && !entry.invoice;
  const place = entryPlace(entry);
  const detail = [
    `${formatTime(entry.start)} to ${formatTime(entry.finish)}`,
    entry.breakMinutes ? `${entry.breakMinutes} min break` : "no break",
    entry.person,
  ].join(" · ");
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-ui-text">{entry.clientName ?? "No client"}</span>
        <span className="block text-ui-sm text-ui-muted">{detail}</span>
        {entry.note ? <span className="block text-ui-sm break-words text-ui-muted">{entry.note}</span> : null}
        {entry.pins?.start || entry.pins?.end || entry.km ? (
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-ui-sm text-ui-muted" data-testid="entry-location">
            {entry.pins?.start ? (
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" weight="duotone" className="text-ui-info" />
                {entry.pins.start === entry.pins.end || !entry.pins.end ? entry.pins.start : `${entry.pins.start}, finished ${entry.pins.end.replace(/^At /, "at ").replace(/^Not /, "not ")}`}
              </span>
            ) : null}
            {entry.km ? (
              <span className="inline-flex items-center gap-1">
                <Car aria-hidden="true" weight="duotone" className="text-ui-info" />
                {entry.km} km
              </span>
            ) : null}
          </span>
        ) : null}
        {entry.invoice ? (
          <span className="mt-1.5 inline-flex">
            <StatusPill tone="ok" icon={<LockSimple weight="bold" />}>
              On {entry.invoice.number}
            </StatusPill>
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-ui-text">{formatHours(entry.hours)}</span>
    </>
  );
  const row = "flex w-full min-h-16 items-start gap-3 px-4 py-3 text-left text-ui-base";
  return (
    <>
      {editable ? (
        <button type="button" onClick={() => onOpen(entry)} data-entry={entry.id} className={cx(row, "ui-focus-ring hover:bg-ui-surface-2", TAP)}>
          {body}
        </button>
      ) : (
        <div data-entry={entry.id} className={row}>
          {body}
        </div>
      )}
      {place ? (
        <div className="-mt-2 px-4 pb-2">
          <button
            type="button"
            onClick={() => onPlace(entry)}
            aria-haspopup="dialog"
            aria-label={`${place.label}: ${entry.clientName ?? "no client"}, ${dayLabel(entry.workDate)}`}
            data-testid="entry-place"
            data-place={entry.id}
            className={cx(
              "ui-focus-ring -ml-2 inline-flex min-h-11 items-center gap-2 rounded-ui-md px-2 text-ui-sm font-semibold text-ui-brand-text hover:bg-ui-surface-2",
              TAP,
            )}
          >
            <MapTrifold aria-hidden="true" weight="duotone" className="text-[1.25rem]" />
            {place.label}
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * The Timesheet tab: one week, Monday to Sunday. Add hours for any day;
 * tap your own unbilled hours to change them. The business owner sees the
 * whole team's hours, can show one person's, and invoices a client for the
 * week.
 */
export function TimesheetView({
  data,
  location,
  openAdd = false,
}: {
  data: TimesheetData;
  /** Your location setting and clock (null: couldn't be read, so no clock card). */
  location?: LocationState | null;
  openAdd?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [person, setPerson] = useState<string | null>(null);

  const [invoicing, setInvoicing] = useState(false);
  const [where, setWhere] = useState<TimesheetEntry | null>(null);

  const shown = useMemo(() => forPerson(data.entries, person), [data.entries, person]);
  const days = useMemo(() => groupByDay(data.weekStart, shown), [data.weekStart, shown]);
  const totals = weekTotals(shown);
  const billable = unbilledByClient(data.entries).length > 0;
  const lastClient = [...data.entries].reverse().find((e) => e.mine && e.clientId)?.clientId ?? null;
  const defaultDay = data.weekStart <= data.today && data.today <= addDays(data.weekStart, 6) ? data.today : data.weekStart;
  // Home's "Log hours" (?add=today) arrives with the add sheet already open.
  const [draft, setDraft] = useState<EntryDraft | null>(() => (openAdd ? newDraft(defaultDay, lastClient) : null));

  // ...and the address is tidied, so a refresh doesn't open it again.
  useEffect(() => {
    if (openAdd) router.replace(pathname ?? "/app/timesheet", { scroll: false });
  }, [openAdd, pathname, router]);

  return (
    <div className={cx("mt-5 space-y-5", UI_TEXT)} data-testid="timesheet">
      {location ? <ClockCard state={location} clients={data.clients} canInvoice={data.canInvoice} /> : null}

      <WeekNav weekStart={data.weekStart} today={data.today} />

      {data.failed ? (
        <Callout tone="bad" title="Couldn't load your hours">
          Check your signal, then open Timesheet again.
        </Callout>
      ) : null}

      <Card className="flex items-center gap-4" data-testid="timesheet-total">
        <IconTile icon={<Timer weight="duotone" />} tone="info" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-ui-sm text-ui-muted">{person ? "Their hours this week" : data.canInvoice && data.people.length > 1 ? "Team hours this week" : "Your hours this week"}</p>
          <p className="ui-heading text-ui-2xl tabular-nums text-ui-text">{formatHours(totals.hours)}</p>
          {totals.invoiced > 0 ? <p className="text-ui-sm text-ui-ok">{formatHours(totals.invoiced)} invoiced</p> : null}
        </div>
      </Card>

      {data.canInvoice && data.people.length > 1 ? (
        <div role="radiogroup" aria-label="Whose hours" className="flex flex-wrap gap-2">
          {[{ userId: null as string | null, name: "Everyone" }, ...data.people].map((p) => {
            const on = person === p.userId;
            return (
              <button
                key={p.userId ?? "all"}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPerson(p.userId)}
                className={cx(
                  "ui-focus-ring min-h-12 rounded-full px-4 text-ui-base font-semibold",
                  TAP,
                  on ? "border-2 border-ui-violet bg-ui-violet-soft text-ui-text" : "border border-ui-line bg-ui-surface text-ui-muted",
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button fullWidth icon={<Plus weight="bold" />} onClick={() => setDraft(newDraft(defaultDay, lastClient))} data-testid="timesheet-add">
          Add hours
        </Button>
        {data.canInvoice && data.people.length > 1 ? (
          <ButtonLink href="/app/timesheet/team" variant="secondary" fullWidth icon={<MapTrifold weight="bold" />}>
            Team map
          </ButtonLink>
        ) : null}
        {data.canInvoice ? (
          <Button
            variant="secondary"
            fullWidth
            icon={<Receipt weight="bold" />}
            onClick={() => setInvoicing(true)}
            disabled={!billable}
            data-testid="timesheet-invoice"
          >
            Invoice this week
          </Button>
        ) : null}
      </div>

      <ol className="space-y-3" aria-label="Days">
        {days.map((group) => (
          <li key={group.day} data-day={group.day}>
            <Card padding="none">
              <div className="flex items-center justify-between gap-3 border-b border-ui-line px-4 py-3">
                <h2 className={cx("ui-title text-ui-base", group.day === data.today ? "text-ui-brand-text" : "text-ui-text")}>
                  {dayLabel(group.day)}
                  {group.day === data.today ? <span className="text-ui-sm font-normal text-ui-muted"> · today</span> : null}
                </h2>
                <span className="text-ui-sm tabular-nums text-ui-muted">
                  {group.hours > 0 ? formatHours(group.hours) : ""}
                  {group.km > 0 ? ` · ${group.km} km` : ""}
                </span>
              </div>
              {group.entries.length > 0 ? (
                <ul className="divide-y divide-ui-line">
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <EntryRow entry={entry} onOpen={(e) => setDraft(draftFrom(e))} onPlace={setWhere} />
                    </li>
                  ))}
                </ul>
              ) : (
                <button
                  type="button"
                  onClick={() => setDraft(newDraft(group.day, lastClient))}
                  className={cx("ui-focus-ring flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-ui-sm text-ui-muted hover:bg-ui-surface-2", TAP)}
                >
                  <Plus aria-hidden="true" weight="bold" className="text-ui-brand-text" /> Add hours for {dayLabel(group.day)}
                </button>
              )}
            </Card>
          </li>
        ))}
      </ol>

      <EntrySheet draft={draft} clients={data.clients} onClose={() => setDraft(null)} />
      <JobLocationSheet entry={where} onClose={() => setWhere(null)} />
      {data.canInvoice ? <InvoiceWeekSheet open={invoicing} onClose={() => setInvoicing(false)} data={data} /> : null}
    </div>
  );
}
