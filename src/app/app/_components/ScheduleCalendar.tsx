"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CaretLeft,
  CaretRight,
  Check,
  PencilSimple,
  Plus,
  X,
} from "@phosphor-icons/react";
import { formatCurrency } from "@/lib/quote-defaults";
import {
  addCalendarNote,
  deleteCalendarNote,
  updateCalendarNote,
} from "./calendar-notes-actions";

/**
 * Dashboard month calendar of scheduled jobs + personal day-notes.
 *
 * Buckets `jobs` and `notes` by their `date` (YYYY-MM-DD), renders a
 * Monday-first month grid with a brand dot on days that have a job and a
 * hi-vis dot on days that have a note, lets the tradie page across months,
 * and shows the selected day's jobs + notes beneath the grid (with an
 * add-note field). `todayISO` comes from the server so SSR and the client
 * agree on the highlighted / default-selected cell (no hydration drift).
 */
export type CalendarJob = {
  id: string;
  date: string;
  clientName: string;
  jobSummary: string;
  total: number;
  currency: string;
};

export type CalendarNote = {
  id: string;
  date: string;
  body: string;
};

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function key(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
function monthLabel(y: number, m: number): string {
  return new Intl.DateTimeFormat("en-NZ", {
    month: "long",
    year: "numeric",
  }).format(new Date(y, m, 1));
}
function longDate(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-NZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

export interface CalendarDayWeather {
  status: "safe" | "caution" | "unsafe";
  tempMaxC: number | null;
  reason: string;
}

const WEATHER_DOT: Record<CalendarDayWeather["status"], string> = {
  safe: "bg-emerald-400",
  caution: "bg-amber-400",
  unsafe: "bg-red-400",
};

export function ScheduleCalendar({
  jobs,
  notes,
  todayISO,
  weather = {},
}: {
  jobs: CalendarJob[];
  notes: CalendarNote[];
  todayISO: string;
  /** Per-date work-suitability (YYYY-MM-DD keys) — forecast range only. */
  weather?: Record<string, CalendarDayWeather>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const jobsByDay = useMemo(() => {
    const map = new Map<string, CalendarJob[]>();
    for (const j of jobs) {
      const k = (j.date ?? "").slice(0, 10);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(j);
      else map.set(k, [j]);
    }
    return map;
  }, [jobs]);

  const notesByDay = useMemo(() => {
    const map = new Map<string, CalendarNote[]>();
    for (const n of notes) {
      const k = (n.date ?? "").slice(0, 10);
      if (!k) continue;
      const arr = map.get(k);
      if (arr) arr.push(n);
      else map.set(k, [n]);
    }
    return map;
  }, [notes]);

  const [ty, tm] = useMemo(() => {
    const [y, m] = todayISO.split("-").map(Number);
    return [y, (m || 1) - 1] as const;
  }, [todayISO]);

  const [view, setView] = useState<{ y: number; m: number }>({ y: ty, m: tm });
  const [selected, setSelected] = useState<string>(todayISO);

  const { cells, year, month } = useMemo(() => {
    const y = view.y;
    const m = view.m;
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Mon = 0
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const list: Array<{ day: number; dateKey: string } | null> = [];
    for (let i = 0; i < firstDow; i++) list.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ day: d, dateKey: key(y, m, d) });
    }
    return { cells: list, year: y, month: m };
  }, [view]);

  const selectedJobs = jobsByDay.get(selected) ?? [];
  const selectedNotes = notesByDay.get(selected) ?? [];
  const selWx = weather[selected] ?? null;

  function step(delta: number) {
    setView((v) => {
      const next = v.m + delta;
      if (next < 0) return { y: v.y - 1, m: 11 };
      if (next > 11) return { y: v.y + 1, m: 0 };
      return { y: v.y, m: next };
    });
  }

  function onAdd() {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addCalendarNote(selected, body);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  function onDelete(id: string) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteCalendarNote(id);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function startEdit(id: string, body: string) {
    setError(null);
    setEditingId(id);
    setEditDraft(body);
  }

  function saveEdit(id: string) {
    const body = editDraft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await updateCalendarNote(id, body);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setEditingId(null);
      router.refresh();
    });
  }

  return (
    <section
      data-testid="dashboard-calendar"
      aria-label="Schedule"
      className="t2q-card-pro mb-7 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <p className="t2q-section-label-pro">{"// schedule"}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => step(-1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-ink-200 hover:border-brand/50 hover:text-brand"
          >
            <CaretLeft size={14} weight="bold" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-semibold text-white">
            {monthLabel(year, month)}
          </span>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => step(1)}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 text-ink-200 hover:border-brand/50 hover:text-brand"
          >
            <CaretRight size={14} weight="bold" />
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-500"
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`b${i}`} aria-hidden="true" />;
          const hasJob = jobsByDay.has(c.dateKey);
          const hasNote = notesByDay.has(c.dateKey);
          const wx = weather[c.dateKey];
          const isToday = c.dateKey === todayISO;
          const isSel = c.dateKey === selected;
          return (
            <button
              key={c.dateKey}
              type="button"
              onClick={() => setSelected(c.dateKey)}
              aria-label={`${c.day}${hasJob ? " — has jobs" : ""}${hasNote ? " — has notes" : ""}${wx ? ` — weather ${wx.status}` : ""}`}
              aria-pressed={isSel}
              data-testid={`cal-day-${c.dateKey}`}
              className={[
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                isSel
                  ? "bg-brand text-ink-900"
                  : isToday
                    ? "border border-brand/50 text-white"
                    : "text-ink-200 hover:bg-white/[0.06]",
              ].join(" ")}
            >
              {c.day}
              {hasJob || hasNote || wx ? (
                <span className="absolute bottom-1 flex items-center gap-0.5">
                  {hasJob ? (
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${isSel ? "bg-ink-900" : "bg-brand"}`}
                    />
                  ) : null}
                  {hasNote ? (
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${isSel ? "bg-ink-900/70" : "bg-hivis"}`}
                    />
                  ) : null}
                  {wx ? (
                    <span
                      aria-hidden="true"
                      className={`h-1 w-1 rounded-full ${isSel ? "bg-ink-900/50" : WEATHER_DOT[wx.status]}`}
                    />
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-white/5 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">
          {longDate(selected)}
        </p>
        {selWx ? (
          <p
            className="mt-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300"
            data-testid="cal-selected-weather"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${WEATHER_DOT[selWx.status]}`}
            />
            {selWx.tempMaxC != null ? `${Math.round(selWx.tempMaxC)}° · ` : ""}
            {selWx.reason}
          </p>
        ) : null}

        {selectedJobs.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {selectedJobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={`/app/quotes/preview/${j.id}`}
                  prefetch
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 transition-colors hover:border-brand/40 hover:bg-brand/[0.06]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-white">{j.clientName}</p>
                    {j.jobSummary ? (
                      <p className="mt-0.5 truncate text-xs text-ink-400">
                        {j.jobSummary}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-brand">
                    {formatCurrency(j.total, j.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Notes for the selected day */}
        <div className="mt-3 space-y-2">
          {selectedNotes.map((n) => (
            <div
              key={n.id}
              data-testid="calendar-note"
              className="flex items-start justify-between gap-2 rounded-xl border border-hivis/20 bg-hivis/[0.06] px-3.5 py-2.5"
            >
              {editingId === n.id ? (
                <>
                  <input
                    type="text"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEdit(n.id);
                      } else if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                    maxLength={500}
                    aria-label="Edit note"
                    data-testid="calendar-note-edit-input"
                    autoFocus
                    className="h-8 min-w-0 flex-1 rounded-full border border-ink-600 bg-ink-900 px-3 text-sm text-white outline-none focus:border-brand"
                  />
                  <button
                    type="button"
                    aria-label="Save note"
                    disabled={pending || !editDraft.trim()}
                    onClick={() => saveEdit(n.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-emerald-300 hover:bg-white/10 disabled:opacity-50"
                  >
                    <Check size={14} weight="bold" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel edit"
                    disabled={pending}
                    onClick={() => setEditingId(null)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </>
              ) : (
                <>
                  <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-ink-100">
                    {n.body}
                  </p>
                  <button
                    type="button"
                    aria-label="Edit note"
                    disabled={pending}
                    onClick={() => startEdit(n.id, n.body)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <PencilSimple size={13} weight="bold" />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete note"
                    disabled={pending}
                    onClick={() => onDelete(n.id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-400 hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <X size={13} weight="bold" />
                  </button>
                </>
              )}
            </div>
          ))}

          {selectedJobs.length === 0 && selectedNotes.length === 0 ? (
            <p className="text-sm text-ink-400">
              Nothing on this day yet. Add a note below, or schedule a job
              from an accepted quote.
            </p>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdd();
                }
              }}
              maxLength={500}
              placeholder="Add a note for this day…"
              aria-label="New note"
              data-testid="calendar-note-input"
              className="h-10 flex-1 rounded-full border border-ink-600 bg-ink-900 px-4 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={onAdd}
              disabled={pending || !draft.trim()}
              aria-label="Add note"
              data-testid="calendar-note-add"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-ink-900 disabled:opacity-50"
            >
              <Plus size={18} weight="bold" />
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-xs text-red-300">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
