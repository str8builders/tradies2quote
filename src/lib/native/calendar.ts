/**
 * Put a booked job on the phone's own calendar (browser code). The Swift side
 * (T2QCalendarPlugin.swift) opens iOS's "New Event" sheet filled in with the
 * job; the person picks the calendar and taps Add. The app never reads the
 * calendar.
 */

import { registerPlugin } from "@capacitor/core";
import { hasNativeModule } from "./plugins";

export interface CalendarJob {
  /** What the event is called. */
  title: string;
  /** The booked day, `YYYY-MM-DD`. The event is all day. */
  date: string;
  location?: string | null;
  notes?: string | null;
}

export type CalendarResult =
  /** The sheet closed: `saved` is whether the person tapped Add. */
  | { ok: true; saved: boolean }
  | { ok: false; message: string };

interface T2QCalendarPlugin {
  addEvent(options: { title: string; date: string; location?: string; notes?: string }): Promise<{ saved: boolean }>;
}

const T2QCalendar = registerPlugin<T2QCalendarPlugin>("T2QCalendar");

export function hasNativeCalendar(): boolean {
  return hasNativeModule("T2QCalendar");
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Opens the sheet. Never throws: a problem comes back as a sentence the person can read. */
export async function addJobToCalendar(job: CalendarJob): Promise<CalendarResult> {
  const title = job.title.trim();
  if (!title || !DAY.test(job.date)) return { ok: false, message: "This job has no day to put on the calendar." };
  if (!hasNativeCalendar()) return { ok: false, message: "The calendar isn't available on this phone." };
  try {
    const location = job.location?.trim();
    const notes = job.notes?.trim();
    const { saved } = await T2QCalendar.addEvent({ title, date: job.date, ...(location ? { location } : {}), ...(notes ? { notes } : {}) });
    return { ok: true, saved: saved === true };
  } catch (e) {
    const message = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "";
    return { ok: false, message: message.trim() || "The calendar didn't open. Try again." };
  }
}
