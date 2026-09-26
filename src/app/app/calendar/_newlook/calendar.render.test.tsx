// The month calendar, rendered to static HTML in node. look="new" (the
// /app/calendar page) is the redesign's body; the default (the old
// dashboard) is unchanged.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/app/_components/calendar-notes-actions", () => ({
  addCalendarNote: vi.fn(),
  deleteCalendarNote: vi.fn(),
  updateCalendarNote: vi.fn(),
}));

import { ScheduleCalendar, type CalendarJob, type CalendarNote } from "../../_components/ScheduleCalendar";
import { CalendarView, dayLabel, type CalendarViewProps } from "./CalendarView";

/** The opening tag of the element holding a fragment (React orders some attributes itself). */
const tagWith = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const TODAY = "2026-09-14";
const JOBS: CalendarJob[] = [
  { id: "q1", date: TODAY, clientName: "Aroha Smith", jobSummary: "Deck rebuild", total: 4850, currency: "NZD" },
];
const NOTES: CalendarNote[] = [
  { id: "n1", date: TODAY, body: "Bring the long ladder" },
  { id: "n2", date: "2026-09-20", body: "Order timber" },
];

const newLook = renderToStaticMarkup(<ScheduleCalendar look="new" jobs={JOBS} notes={NOTES} todayISO={TODAY} />);

describe("ScheduleCalendar look=\"new\"", () => {
  it("a month grid with big day buttons and a way across months", () => {
    expect(newLook).toContain('data-testid="calendar-view"');
    expect(newLook).toContain("September 2026");
    expect(newLook).toContain('aria-label="Previous month"');
    expect(newLook).toContain('aria-label="Next month"');
    for (const day of ["Mon", "Tue", "Sun"]) expect(newLook).toContain(`>${day}<`);
    const days = newLook.match(/data-testid="cal-day-2026-09-\d\d"/g) ?? [];
    expect(days).toHaveLength(30);
    const today = newLook.match(/<button[^>]*data-testid="cal-day-2026-09-14"[^>]*>/)?.[0] ?? "";
    expect(today).toContain('aria-pressed="true"');
    expect(today).toContain('aria-current="date"');
    expect(today).toContain("min-h-11");
    expect(today).toContain("bg-ui-brand");
  });

  it("days with jobs and notes say so in words too", () => {
    expect(newLook).toContain(`aria-label="${dayLabel(14, true, true)}"`);
    expect(newLook).toContain(`aria-label="${dayLabel(20, false, true)}"`);
    expect(newLook).toContain("Job booked");
    expect(newLook).toContain("Your note");
  });

  it("the chosen day: its jobs as rows to open, its notes, and a box to add one", () => {
    expect(newLook).toContain("Monday, 14 September");
    expect(newLook).toContain('href="/app/quotes/preview/q1"');
    expect(newLook).toContain("Aroha Smith");
    expect(newLook).toContain("Deck rebuild");
    expect(newLook).toContain("$4,850.00");
    expect(newLook).toContain('data-testid="calendar-note"');
    expect(newLook).toContain("Bring the long ladder");
    expect(newLook).toContain('aria-label="Edit note"');
    expect(newLook).toContain('aria-label="Delete note"');
    expect(newLook).toContain('data-testid="calendar-note-input"');
    expect(newLook).toMatch(/<button[^>]*data-testid="calendar-note-add"[^>]*disabled/);
    expect(newLook).not.toContain("Order timber");
  });

  it("uses the new look only", () => {
    expect(newLook).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ |dashboard-calendar/);
  });
});

describe("CalendarView states", () => {
  const base: CalendarViewProps = {
    monthLabel: "September 2026",
    onPrevMonth: () => {},
    onNextMonth: () => {},
    cells: [null, { day: 1, dateKey: "2026-09-01" }],
    todayISO: TODAY,
    selected: "2026-09-01",
    onSelect: () => {},
    jobsByDay: new Map(),
    notesByDay: new Map([["2026-09-01", [NOTES[0]]]]),
    weather: { "2026-09-01": { status: "caution", tempMaxC: 17.6, reason: "Gusty wind" } },
    selectedLabel: "Tuesday, 1 September",
    selectedJobs: [],
    selectedNotes: [NOTES[0]],
    selectedWeather: { status: "caution", tempMaxC: 17.6, reason: "Gusty wind" },
    draft: "",
    onDraftChange: () => {},
    onAdd: () => {},
    editingId: null,
    editDraft: "",
    onEditDraftChange: () => {},
    onStartEdit: () => {},
    onSaveEdit: () => {},
    onCancelEdit: () => {},
    onDelete: () => {},
    pending: false,
    error: null,
  };

  it("weather: a line for the day and the colours explained", () => {
    const html = renderToStaticMarkup(<CalendarView {...base} />);
    expect(html).toMatch(/data-testid="cal-selected-weather"[\s\S]*18° · Gusty wind/);
    expect(html).toContain("Take care");
    expect(html).toContain(`aria-label="${dayLabel(1, false, true, base.selectedWeather!)}"`);
  });

  it("editing a note: its own box with Save and Cancel", () => {
    const html = renderToStaticMarkup(<CalendarView {...base} editingId="n1" editDraft="Bring the ladder" />);
    expect(tagWith(html, 'data-testid="calendar-note-edit-input"')).toContain('value="Bring the ladder"');
    expect(html).toContain(">Save note<");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain('aria-label="Delete note"');
  });

  it("an empty day and an error", () => {
    const html = renderToStaticMarkup(
      <CalendarView {...base} selectedNotes={[]} notesByDay={new Map()} weather={{}} selectedWeather={null} error="Couldn't save that note." />,
    );
    expect(html).toContain("Nothing on this day yet.");
    expect(html).toMatch(/role="alert"[\s\S]*Couldn&#x27;t save that note\./);
    expect(html).not.toContain("Take care");
  });
});

describe("ScheduleCalendar default (the old dashboard)", () => {
  it("is unchanged", () => {
    const old = renderToStaticMarkup(<ScheduleCalendar jobs={JOBS} notes={NOTES} todayISO={TODAY} />);
    expect(old).toContain('data-testid="dashboard-calendar"');
    expect(old).toContain("t2q-card-pro");
    expect(old).toContain("// schedule");
    expect(old).toContain(">Mo<");
    expect(old).not.toContain('data-testid="calendar-view"');
  });
});
