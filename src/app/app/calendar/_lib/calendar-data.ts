import type { CalendarJob, CalendarNote } from "../../_components/ScheduleCalendar";

export type CalendarJobRow = {
  id: string;
  scheduled_for: string | null;
  total_amount: number | string | null;
  currency: string | null;
  job_summary?: string | null;
  client_name?: string | null;
};

export type CalendarNoteRow = { id: string; note_date: string | null; body: string | null };

/** Rows from the scheduled-quotes query → calendar jobs (same mapping as the old dashboard). */
export function calendarJobsFromRows(rows: readonly CalendarJobRow[]): CalendarJob[] {
  return rows
    .filter((q) => typeof q.scheduled_for === "string" && q.scheduled_for.length >= 10)
    .map((q) => ({
      id: q.id,
      date: (q.scheduled_for as string).slice(0, 10),
      clientName: q.client_name?.trim() || "—",
      jobSummary: q.job_summary?.trim() ?? "",
      total: Number(q.total_amount) || 0,
      currency: q.currency || "NZD",
    }));
}

/** Rows from calendar_notes → calendar notes; rows without a date or text are skipped. */
export function calendarNotesFromRows(rows: readonly CalendarNoteRow[]): CalendarNote[] {
  return rows
    .filter((n) => typeof n.note_date === "string" && n.note_date.length >= 10 && typeof n.body === "string")
    .map((n) => ({ id: n.id, date: (n.note_date as string).slice(0, 10), body: n.body as string }));
}
