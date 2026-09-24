import { describe, expect, it } from "vitest";
import { dueDateForSend } from "./invoice-due-date";

const now = new Date("2026-09-24T10:00:00.000Z");

describe("dueDateForSend", () => {
  it("restarts the draft's 7-day term from the first send", () => {
    expect(
      dueDateForSend(
        { created_at: "2026-09-01T09:00:00.000Z", due_date: "2026-09-08T09:00:00.000Z", sent_at: null },
        now,
      ),
    ).toBe("2026-10-01T10:00:00.000Z");
  });

  it("keeps a longer term the draft was given", () => {
    expect(
      dueDateForSend(
        { created_at: "2026-09-01T00:00:00.000Z", due_date: "2026-09-15T00:00:00.000Z", sent_at: null },
        now,
      ),
    ).toBe("2026-10-08T10:00:00.000Z");
  });

  it("keeps the date already given when re-sending", () => {
    const due = "2026-09-20T00:00:00.000Z";
    expect(
      dueDateForSend({ created_at: "2026-09-01T00:00:00.000Z", due_date: due, sent_at: "2026-09-13T00:00:00.000Z" }, now),
    ).toBe(due);
  });

  it("falls back to 7 days for an unusable term and keeps 'on receipt'", () => {
    expect(
      dueDateForSend({ created_at: "2026-09-10T00:00:00.000Z", due_date: "2026-09-01T00:00:00.000Z", sent_at: null }, now),
    ).toBe("2026-10-01T10:00:00.000Z");
    expect(dueDateForSend({ created_at: "2026-09-10T00:00:00.000Z", due_date: null, sent_at: null }, now)).toBeNull();
  });
});
