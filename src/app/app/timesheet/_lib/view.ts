/** Shaping a week of hours for the screen (pure, tested). */

import { sumHours } from "@/lib/timesheet/hours";
import { weekDays } from "@/lib/timesheet/week";
import type { TimesheetEntry } from "./types";

export interface DayGroup {
  day: string;
  entries: TimesheetEntry[];
  hours: number;
}

/** Only one person's hours, or everyone's (null). */
export function forPerson(entries: readonly TimesheetEntry[], userId: string | null): TimesheetEntry[] {
  return userId ? entries.filter((e) => e.userId === userId) : entries.slice();
}

/** All seven days, Monday first, each with its entries (by start time) and hours. */
export function groupByDay(weekStart: string, entries: readonly TimesheetEntry[]): DayGroup[] {
  return weekDays(weekStart).map((day) => {
    const list = entries.filter((e) => e.workDate === day).sort((a, b) => a.start.localeCompare(b.start));
    return { day, entries: list, hours: sumHours(list.map((e) => e.hours)) };
  });
}

export interface ClientHours {
  clientId: string;
  name: string;
  hours: number;
  count: number;
}

/** Clients with hours still to invoice this week, most hours first. */
export function unbilledByClient(entries: readonly TimesheetEntry[]): ClientHours[] {
  const map = new Map<string, ClientHours>();
  for (const e of entries) {
    if (e.invoice || !e.clientId) continue;
    const row = map.get(e.clientId) ?? { clientId: e.clientId, name: e.clientName ?? "Client", hours: 0, count: 0 };
    row.hours = sumHours([row.hours, e.hours]);
    row.count += 1;
    map.set(e.clientId, row);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

/** The week's hours in total, and how much of it is invoiced. */
export function weekTotals(entries: readonly TimesheetEntry[]): { hours: number; invoiced: number } {
  return {
    hours: sumHours(entries.map((e) => e.hours)),
    invoiced: sumHours(entries.filter((e) => e.invoice).map((e) => e.hours)),
  };
}
