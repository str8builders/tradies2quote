// Deleting and restoring jobs: the pure parts (ids, "deleted together",
// Recently deleted rows, the words of the delete check).

import { describe, expect, it } from "vitest";
import { NOW, NZ, daysAgo, invoice, quote } from "./fixtures";
import {
  CO_DELETED_WITHIN_MS,
  JOBS_ACTION_LIMIT,
  buildDeletedJobRows,
  buildJobRows,
  deleteJobsCopy,
  deletedTogether,
  isBilledInvoice,
  parseJobIds,
  type BoardQuote,
  type DeletedQuote,
  type JobRow,
} from "./job-board";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const gone = (over: Partial<BoardQuote>, deletedAt: string): DeletedQuote => ({ ...quote(over), deletedAt });

describe("parseJobIds: what a delete or restore accepts", () => {
  it("real ids, trimmed, lower case, each once", () => {
    const a = uuid(1);
    expect(parseJobIds([a.toUpperCase(), ` ${a} `, uuid(2)])).toEqual({ ok: true, ids: [a, uuid(2)] });
  });

  it("nothing picked, or not a list", () => {
    for (const bad of [[], null, undefined, "abc", 3, { 0: uuid(1) }]) {
      expect(parseJobIds(bad)).toEqual({ ok: false, error: "Pick at least one job first." });
    }
  });

  it("anything that isn't an id is refused as a whole", () => {
    for (const bad of [["not-an-id"], [uuid(1), 7], [uuid(1), ""], [`${uuid(1)}; drop table`]]) {
      const result = parseJobIds(bad);
      expect(result.ok).toBe(false);
    }
  });

  it(`at most ${JOBS_ACTION_LIMIT} at a time`, () => {
    const many = Array.from({ length: JOBS_ACTION_LIMIT + 1 }, (_, i) => uuid(i));
    expect(parseJobIds(many)).toEqual({ ok: false, error: `Pick up to ${JOBS_ACTION_LIMIT} jobs at a time.` });
    expect(parseJobIds(many.slice(0, JOBS_ACTION_LIMIT)).ok).toBe(true);
  });
});

describe("deletedTogether", () => {
  const at = "2026-09-20T01:00:00.000Z";
  it("same time, or within a few seconds either way", () => {
    expect(deletedTogether(at, at)).toBe(true);
    expect(deletedTogether(at, "2026-09-20T01:00:00+00:00")).toBe(true);
    expect(deletedTogether(at, new Date(Date.parse(at) + CO_DELETED_WITHIN_MS).toISOString())).toBe(true);
    expect(deletedTogether(at, new Date(Date.parse(at) - 3_000).toISOString())).toBe(true);
  });
  it("deleted on its own, earlier or later, or never", () => {
    expect(deletedTogether(at, new Date(Date.parse(at) + CO_DELETED_WITHIN_MS + 1).toISOString())).toBe(false);
    expect(deletedTogether(at, "2026-09-18T01:00:00.000Z")).toBe(false);
    expect(deletedTogether(at, null)).toBe(false);
    expect(deletedTogether(undefined, at)).toBe(false);
    expect(deletedTogether("junk", at)).toBe(false);
  });
});

describe("buildJobRows: what the delete check needs", () => {
  const rows = buildJobRows(
    [
      quote({ id: "draft", status: "draft" }),
      quote({ id: "sent", status: "sent", sentAt: daysAgo(2) }),
      quote({ id: "declined", status: "declined" }),
      quote({ id: "paid", status: "completed", sentAt: daysAgo(30) }),
      quote({ id: "timesheet", status: "completed" }),
      quote({ id: "cancelled", status: "completed" }),
    ],
    [
      invoice("paid", { status: "paid", paidAt: daysAgo(1) }),
      invoice("timesheet", { status: "draft" }),
      invoice("cancelled", { status: "cancelled" }),
    ],
    NOW,
    NZ,
  );
  const byId = (id: string) => rows.find((r) => r.id === id)!;

  it("the live invoice's status (cancelled ones don't count)", () => {
    expect(byId("draft").invoiceStatus).toBeNull();
    expect(byId("paid").invoiceStatus).toBe("paid");
    expect(byId("timesheet").invoiceStatus).toBe("draft");
    expect(byId("cancelled").invoiceStatus).toBeNull();
  });

  it("whether the client has had the quote", () => {
    expect(byId("draft").sentToClient).toBe(false);
    expect(byId("sent").sentToClient).toBe(true);
    expect(byId("declined").sentToClient).toBe(true);
    expect(byId("paid").sentToClient).toBe(true);
    // Made from the timesheet: never sent as a quote.
    expect(byId("timesheet").sentToClient).toBe(false);
  });

  it("billed means sent, overdue or paid", () => {
    for (const status of ["sent", "overdue", "paid"] as const) expect(isBilledInvoice(status)).toBe(true);
    expect(isBilledInvoice("draft")).toBe(false);
    expect(isBilledInvoice("cancelled")).toBe(false);
    expect(isBilledInvoice(null)).toBe(false);
  });
});

describe("buildDeletedJobRows: Recently deleted", () => {
  const older = gone({ id: "older", status: "completed", clientName: "Ben Walker", total: 900 }, daysAgo(3));
  const today = gone({ id: "today", status: "completed", clientName: "Sam Taylor" }, daysAgo(0.1));
  // 11.30 pm on Thursday in NZ: 10.5 hours ago, but yesterday on the calendar.
  const lateLast = gone({ id: "late", status: "completed", clientName: "Mere Hohaia" }, "2026-09-24T11:30:00.000Z");
  const rows = buildDeletedJobRows(
    [older, today, lateLast],
    [
      // Deleted with its job: comes back with it.
      { ...invoice("older", { status: "paid", paidAt: daysAgo(20), total: 1035 }), deletedAt: older.deletedAt },
      // Deleted on its own, a week before its job: stays deleted.
      { ...invoice("today", { status: "sent", dueDate: daysAgo(2) }), deletedAt: daysAgo(7) },
      // Never deleted (still on the board): the job comes back with it.
      invoice("late", { status: "sent", dueDate: daysAgo(-5) }),
      // Someone else's job entirely.
      invoice("live-job", { status: "paid" }),
    ],
    NOW,
    NZ,
  );

  it("newest deletion first, each saying when", () => {
    expect(rows.map((r) => [r.id, r.deletedLabel])).toEqual([
      ["today", "Deleted today"],
      ["late", "Deleted yesterday"],
      ["older", "Deleted 3 days ago"],
    ]);
    expect(rows[0].deletedAt).toBe(today.deletedAt);
  });

  it("each job reads as it would come back", () => {
    const byId = (id: string) => rows.find((r) => r.id === id)!;
    expect([byId("older").pill.text, byId("older").amount]).toEqual(["Paid", 1035]);
    expect(byId("today").pill.text).toBe("Not invoiced");
    expect(byId("today").invoiceStatus).toBeNull();
    expect(byId("late").pill.text).toBe("Invoice sent");
  });

  it("nothing deleted, nothing listed", () => {
    expect(buildDeletedJobRows([], [invoice("x")], NOW, NZ)).toEqual([]);
  });
});

describe("deleteJobsCopy: the words of the check", () => {
  const row = (over: Partial<Pick<JobRow, "invoiceStatus" | "sentToClient">> = {}) => ({
    invoiceStatus: null,
    sentToClient: false,
    ...over,
  });

  it("three jobs, two already billed", () => {
    expect(
      deleteJobsCopy([row({ invoiceStatus: "paid" }), row({ invoiceStatus: "sent" }), row()]),
    ).toEqual({
      title: "Delete 3 jobs?",
      body: "They're removed from Jobs and your totals. You can restore them from Recently deleted.",
      billed: "2 have invoices you've already sent or been paid for.",
      links: "Clients can't open these quotes any more.",
      confirm: "Delete 3 jobs",
      keep: "Keep them",
    });
  });

  it("drafts only: no warnings", () => {
    const copy = deleteJobsCopy([row(), row({ invoiceStatus: "draft" })]);
    expect(copy.billed).toBeNull();
    expect(copy.links).toBeNull();
    expect(copy.title).toBe("Delete 2 jobs?");
  });

  it("sent quotes without an invoice: only the links warning", () => {
    const copy = deleteJobsCopy([row({ sentToClient: true }), row()]);
    expect(copy.billed).toBeNull();
    expect(copy.links).toBe("Clients can't open these quotes any more.");
  });

  it("counts read naturally", () => {
    expect(deleteJobsCopy([row({ invoiceStatus: "overdue" }), row(), row()]).billed).toBe(
      "1 has an invoice you've already sent or been paid for.",
    );
    expect(deleteJobsCopy([row({ invoiceStatus: "paid" }), row({ invoiceStatus: "paid" })]).billed).toBe(
      "Both have invoices you've already sent or been paid for.",
    );
    expect(deleteJobsCopy([row({ invoiceStatus: "paid" }), row({ invoiceStatus: "sent" }), row({ invoiceStatus: "overdue" })]).billed).toBe(
      "All 3 have invoices you've already sent or been paid for.",
    );
    expect(deleteJobsCopy([row({ invoiceStatus: "cancelled" })]).billed).toBeNull();
  });

  it("one job", () => {
    expect(deleteJobsCopy([row({ invoiceStatus: "paid", sentToClient: true })])).toEqual({
      title: "Delete this job?",
      body: "It's removed from Jobs and your totals. You can restore it from Recently deleted.",
      billed: "It has an invoice you've already sent or been paid for.",
      links: "Your client can't open this quote any more.",
      confirm: "Delete 1 job",
      keep: "Keep it",
    });
  });
});
