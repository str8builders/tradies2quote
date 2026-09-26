import { Briefcase, CaretLeft, CaretRight, Check, PencilSimple, Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { TAP } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import type { CalendarDayWeather, CalendarJob, CalendarNote } from "../../_components/ScheduleCalendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Longest note the calendar keeps (calendar-notes-actions trims to this). */
const MAX_NOTE = 500;

const WEATHER_DOT: Record<CalendarDayWeather["status"], string> = {
  safe: "bg-ui-ok",
  caution: "bg-ui-warn",
  unsafe: "bg-ui-bad",
};

const WEATHER_WORDS: Record<CalendarDayWeather["status"], string> = {
  safe: "Good to work",
  caution: "Take care",
  unsafe: "Not safe to work",
};

export interface CalendarDayCell {
  day: number;
  dateKey: string;
}

/**
 * Everything the month calendar shows, worked out by <ScheduleCalendar>
 * (which keeps the state and runs the note actions for both looks).
 */
export interface CalendarViewProps {
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** The month grid, Monday first; null for the blanks before day 1. */
  cells: ReadonlyArray<CalendarDayCell | null>;
  todayISO: string;
  selected: string;
  onSelect: (dateKey: string) => void;
  jobsByDay: ReadonlyMap<string, CalendarJob[]>;
  notesByDay: ReadonlyMap<string, CalendarNote[]>;
  weather: Readonly<Record<string, CalendarDayWeather>>;
  /** "Sunday, 13 September" for the selected day. */
  selectedLabel: string;
  selectedJobs: CalendarJob[];
  selectedNotes: CalendarNote[];
  selectedWeather: CalendarDayWeather | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onAdd: () => void;
  editingId: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (id: string, body: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  pending: boolean;
  error: string | null;
}

/** The screen-reader name of a day: the old calendar's words. */
export function dayLabel(day: number, hasJob: boolean, hasNote: boolean, weather?: CalendarDayWeather): string {
  return `${day}${hasJob ? " — has jobs" : ""}${hasNote ? " — has notes" : ""}${weather ? ` — weather ${weather.status}` : ""}`;
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cx("h-1.5 w-1.5 rounded-full", className)} />;
}

function DayButton({
  cell,
  hasJob,
  hasNote,
  weather,
  isToday,
  isSelected,
  onSelect,
}: {
  cell: CalendarDayCell;
  hasJob: boolean;
  hasNote: boolean;
  weather?: CalendarDayWeather;
  isToday: boolean;
  isSelected: boolean;
  onSelect: (dateKey: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(cell.dateKey)}
      aria-label={dayLabel(cell.day, hasJob, hasNote, weather)}
      aria-pressed={isSelected}
      aria-current={isToday ? "date" : undefined}
      data-testid={`cal-day-${cell.dateKey}`}
      className={cx(
        "ui-focus-ring relative flex aspect-square min-h-11 flex-col items-center justify-center rounded-ui-md text-ui-base font-semibold tabular-nums sm:aspect-auto sm:h-14",
        TAP,
        isSelected
          ? "bg-ui-brand text-ui-on-brand"
          : isToday
            ? "border-2 border-ui-brand text-ui-text"
            : "text-ui-text hover:bg-ui-surface-2",
      )}
    >
      {cell.day}
      {hasJob || hasNote || weather ? (
        <span className="absolute bottom-1.5 flex items-center gap-1">
          {hasJob ? <Dot className={isSelected ? "bg-ui-on-brand" : "bg-ui-brand"} /> : null}
          {hasNote ? <Dot className={isSelected ? "bg-ui-on-brand" : "bg-ui-info"} /> : null}
          {weather ? <Dot className={WEATHER_DOT[weather.status]} /> : null}
        </span>
      ) : null}
    </button>
  );
}

function Legend({ showWeather }: { showWeather: boolean }) {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ui-line px-4 py-3 text-ui-sm text-ui-muted" data-testid="calendar-legend">
      <span className="inline-flex items-center gap-1.5">
        <Dot className="bg-ui-brand" />
        Job booked
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Dot className="bg-ui-info" />
        Your note
      </span>
      {showWeather
        ? (Object.keys(WEATHER_WORDS) as Array<CalendarDayWeather["status"]>).map((status) => (
            <span key={status} className="inline-flex items-center gap-1.5">
              <Dot className={WEATHER_DOT[status]} />
              {WEATHER_WORDS[status]}
            </span>
          ))
        : null}
    </p>
  );
}

function NoteItem({
  note,
  editing,
  editDraft,
  pending,
  onEditDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: {
  note: CalendarNote;
  editing: boolean;
  editDraft: string;
  pending: boolean;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (id: string, body: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li data-testid="calendar-note" className="rounded-ui-md border border-ui-line bg-ui-surface-2 p-3">
      {editing ? (
        <div className="space-y-3">
          <TextField
            label="Edit note"
            labelHidden
            value={editDraft}
            onChange={(event) => onEditDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSaveEdit(note.id);
              } else if (event.key === "Escape") {
                onCancelEdit();
              }
            }}
            maxLength={MAX_NOTE}
            autoFocus
            autoComplete="off"
            data-testid="calendar-note-edit-input"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              icon={<Check weight="bold" />}
              disabled={pending || !editDraft.trim()}
              onClick={() => onSaveEdit(note.id)}
            >
              Save note
            </Button>
            <Button variant="ghost" disabled={pending} onClick={onCancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-1">
          <p className="min-w-0 flex-1 py-2.5 pl-1 break-words whitespace-pre-wrap text-ui-text">{note.body}</p>
          <IconButton
            label="Edit note"
            icon={<PencilSimple weight="bold" />}
            disabled={pending}
            onClick={() => onStartEdit(note.id, note.body)}
          />
          <IconButton
            label="Delete note"
            icon={<Trash weight="bold" />}
            disabled={pending}
            onClick={() => onDelete(note.id)}
          />
        </div>
      )}
    </li>
  );
}

/**
 * The month calendar in the new look: a big-target month grid, then the
 * chosen day's booked jobs and your notes for it, with a box to add one.
 * Presentational; <ScheduleCalendar look="new"> passes it everything.
 */
export function CalendarView(props: CalendarViewProps) {
  const {
    cells,
    todayISO,
    selected,
    jobsByDay,
    notesByDay,
    weather,
    selectedJobs,
    selectedNotes,
    selectedWeather,
    pending,
    error,
  } = props;
  const showWeather = cells.some((cell) => cell !== null && weather[cell.dateKey] !== undefined);

  return (
    <div className="space-y-4" data-testid="calendar-view">
      <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="calendar-month-title">
        <div className="flex items-center justify-between gap-2 px-2 pt-2">
          <IconButton label="Previous month" icon={<CaretLeft weight="bold" />} onClick={props.onPrevMonth} />
          <h2 id="calendar-month-title" aria-live="polite" className="ui-title text-ui-lg text-ui-text">
            {props.monthLabel}
          </h2>
          <IconButton label="Next month" icon={<CaretRight weight="bold" />} onClick={props.onNextMonth} />
        </div>
        <div className="grid grid-cols-7 gap-0.5 px-2 pt-2 pb-3">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} aria-hidden="true" className="pb-1 text-center text-ui-xs font-semibold text-ui-muted">
              {weekday}
            </span>
          ))}
          {cells.map((cell, index) =>
            cell ? (
              <DayButton
                key={cell.dateKey}
                cell={cell}
                hasJob={jobsByDay.has(cell.dateKey)}
                hasNote={notesByDay.has(cell.dateKey)}
                weather={weather[cell.dateKey]}
                isToday={cell.dateKey === todayISO}
                isSelected={cell.dateKey === selected}
                onSelect={props.onSelect}
              />
            ) : (
              <span key={`blank-${index}`} aria-hidden="true" />
            ),
          )}
        </div>
        <Legend showWeather={showWeather} />
      </Card>

      <Card as="section" padding="lg" className="space-y-4" aria-labelledby="calendar-day-title" data-testid="calendar-day">
        <div>
          <h3 id="calendar-day-title" className="ui-title text-ui-lg text-ui-text">
            {props.selectedLabel}
          </h3>
          {selectedWeather ? (
            <p className="mt-1 flex items-center gap-2 text-ui-sm text-ui-muted" data-testid="cal-selected-weather">
              <Dot className={WEATHER_DOT[selectedWeather.status]} />
              {selectedWeather.tempMaxC != null ? `${Math.round(selectedWeather.tempMaxC)}° · ` : ""}
              {selectedWeather.reason}
            </p>
          ) : null}
        </div>

        {selectedJobs.length > 0 ? (
          <ul className="divide-y divide-ui-line overflow-hidden rounded-ui-md border border-ui-line" aria-label="Jobs booked this day">
            {selectedJobs.map((job) => (
              <li key={job.id}>
                <ListRow
                  href={`/app/quotes/preview/${job.id}`}
                  icon={<Briefcase weight="duotone" />}
                  iconTone="info"
                  title={job.clientName}
                  subtitle={job.jobSummary || undefined}
                  trailing={<Money amount={job.total} currency={job.currency} />}
                />
              </li>
            ))}
          </ul>
        ) : null}

        {selectedNotes.length > 0 ? (
          <ul className="space-y-2" aria-label="Your notes for this day">
            {selectedNotes.map((note) => (
              <NoteItem
                key={note.id}
                note={note}
                editing={props.editingId === note.id}
                editDraft={props.editDraft}
                pending={pending}
                onEditDraftChange={props.onEditDraftChange}
                onStartEdit={props.onStartEdit}
                onSaveEdit={props.onSaveEdit}
                onCancelEdit={props.onCancelEdit}
                onDelete={props.onDelete}
              />
            ))}
          </ul>
        ) : null}

        {selectedJobs.length === 0 && selectedNotes.length === 0 ? (
          <p className="text-ui-muted">Nothing on this day yet. Add a note below, or book a job from an accepted quote.</p>
        ) : null}

        <div className="space-y-3">
          <TextField
            label="Add a note"
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                props.onAdd();
              }
            }}
            maxLength={MAX_NOTE}
            placeholder="Bring the long ladder"
            autoComplete="off"
            data-testid="calendar-note-input"
          />
          <Button
            variant="secondary"
            fullWidth
            icon={<Plus weight="bold" />}
            disabled={pending || !props.draft.trim()}
            onClick={props.onAdd}
            data-testid="calendar-note-add"
          >
            Add the note
          </Button>
        </div>

        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
