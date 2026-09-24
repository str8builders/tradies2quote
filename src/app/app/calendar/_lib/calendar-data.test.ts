import { describe, expect, it } from "vitest";
import { calendarJobsFromRows, calendarNotesFromRows } from "./calendar-data";

describe("calendar data", () => {
  it("maps scheduled quotes like the old dashboard", () => {
    expect(
      calendarJobsFromRows([
        {
          id: "q1",
          scheduled_for: "2026-09-30T19:00:00.000Z",
          total_amount: "4830.00",
          currency: "NZD",
          job_summary: " New deck at 14 Rata St ",
          client_name: "Sam Taylor",
        },
      ]),
    ).toEqual([
      { id: "q1", date: "2026-09-30", clientName: "Sam Taylor", jobSummary: "New deck at 14 Rata St", total: 4830, currency: "NZD" },
    ]);
  });

  it("falls back safely and drops rows without a date", () => {
    expect(
      calendarJobsFromRows([
        { id: "a", scheduled_for: "2026-10-01", total_amount: null, currency: null, job_summary: null, client_name: "  " },
        { id: "b", scheduled_for: null, total_amount: 10, currency: "AUD" },
      ]),
    ).toEqual([{ id: "a", date: "2026-10-01", clientName: "—", jobSummary: "", total: 0, currency: "NZD" }]);
  });

  it("keeps notes with a date and text only", () => {
    expect(
      calendarNotesFromRows([
        { id: "n1", note_date: "2026-09-29", body: "Pick up stain" },
        { id: "n2", note_date: null, body: "no date" },
        { id: "n3", note_date: "2026-09-29", body: null },
      ]),
    ).toEqual([{ id: "n1", date: "2026-09-29", body: "Pick up stain" }]);
  });
});
