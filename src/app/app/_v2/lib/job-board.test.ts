import { describe, expect, it } from "vitest";
import { NOW, NZ, daysAgo, invoice, quote } from "./fixtures";
import {
  JOB_FILTERS,
  buildJobRows,
  clientFirstName,
  filterCounts,
  FILTER_TONE,
  clientInitials,
  clientTone,
  NO_CLIENT_NAME,
  invoiceLateDays,
  jobState,
  jobsFilterForInvoiceStatus,
  jobsFilterForQuoteStage,
  jobsHref,
  liveInvoicesByQuote,
  matchesSearch,
  oldLookHrefForJobs,
  parseJobFilter,
  rowsForFilter,
  type BoardInvoice,
  type BoardQuote,
  type JobFilter,
} from "./job-board";

const state = (q: BoardQuote, inv: BoardInvoice | null = null) => jobState(q, inv, NOW, NZ);

describe("jobState: quote statuses without an invoice", () => {
  const cases: Array<[BoardQuote, string, JobFilter | null, string, string]> = [
    [quote({ status: "draft" }), "draft", "to-send", "Draft", "neutral"],
    [quote({ status: "sent", sentAt: daysAgo(1) }), "sent", "waiting", "Waiting for Sam", "info"],
    [quote({ status: "viewed", viewedAt: daysAgo(1) }), "viewed", "waiting", "Seen by Sam", "info"],
    [quote({ status: "accepted", acceptedAt: daysAgo(1) }), "accepted", "booked", "Accepted", "ok"],
    [quote({ status: "scheduled", scheduledFor: "2026-09-29" }), "scheduled", "booked", "Booked Tue 29 Sept", "ok"],
    [quote({ status: "scheduled", scheduledFor: null }), "scheduled", "booked", "Booked", "ok"],
    [quote({ status: "in_progress", startedAt: daysAgo(2) }), "in_progress", "booked", "Job started", "info"],
    [quote({ status: "completed", completedAt: daysAgo(1) }), "not_invoiced", "unpaid", "Not invoiced", "warn"],
    [quote({ status: "declined" }), "declined", null, "Declined", "neutral"],
    [quote({ status: "expired" }), "expired", null, "Expired", "neutral"],
  ];
  it.each(cases)("%# %j", (q, stage, filter, pill, tone) => {
    const s = state(q);
    expect(s.stage).toBe(stage);
    expect(s.filter).toBe(filter);
    expect(s.pill).toEqual({ text: pill, tone });
    expect(s.daysLate).toBeNull();
  });

  it("a timestamp job date reads its calendar day", () => {
    expect(state(quote({ status: "scheduled", scheduledFor: "2026-09-30T00:00:00+00:00" })).pill.text).toBe(
      "Booked Wed 30 Sept",
    );
  });

  it("no client name: plain words instead of a placeholder", () => {
    expect(state(quote({ status: "sent", clientName: "To be confirmed" })).pill.text).toBe("Waiting for a reply");
    expect(state(quote({ status: "viewed", clientName: null })).pill.text).toBe("Seen, no reply yet");
  });
});

describe("jobState: completed jobs, invoice folded in", () => {
  const done = () => quote({ status: "completed", completedAt: daysAgo(5) });

  it("draft invoice → Unpaid, not sent yet", () => {
    const q = done();
    const s = state(q, invoice(q.id, { status: "draft" }));
    expect([s.stage, s.filter, s.pill.text, s.pill.tone]).toEqual(["invoice_draft", "unpaid", "Invoice not sent", "warn"]);
  });

  it("sent and not yet due → Unpaid, Invoice sent", () => {
    const q = done();
    const s = state(q, invoice(q.id, { status: "sent", dueDate: daysAgo(-3), sentAt: daysAgo(4) }));
    expect([s.stage, s.filter, s.pill.text, s.pill.tone]).toEqual(["invoice_sent", "unpaid", "Invoice sent", "info"]);
  });

  it("past its due time but still the due day (NZ) is not late yet", () => {
    const q = done();
    // 8 am on Friday 25 September in NZ; it is 10 am.
    const s = state(q, invoice(q.id, { status: "sent", dueDate: "2026-09-24T20:00:00.000Z" }));
    expect(s.stage).toBe("invoice_sent");
  });

  it("sent and past its due date → late, counted in NZ calendar days", () => {
    const q = done();
    const s = state(q, invoice(q.id, { status: "sent", dueDate: daysAgo(9) }));
    expect([s.stage, s.filter, s.pill.text, s.pill.tone, s.daysLate]).toEqual([
      "invoice_late",
      "unpaid",
      "9 days late",
      "bad",
      9,
    ]);
    const one = state(q, invoice(q.id, { status: "sent", dueDate: daysAgo(1) }));
    expect(one.pill.text).toBe("1 day late");
  });

  it("marked overdue before its date still reads as overdue", () => {
    const q = done();
    const s = state(q, invoice(q.id, { status: "overdue", dueDate: daysAgo(-2) }));
    expect([s.stage, s.pill.text, s.daysLate]).toEqual(["invoice_late", "Overdue", 0]);
    const noDate = state(q, invoice(q.id, { status: "overdue", dueDate: null }));
    expect(noDate.pill.text).toBe("Overdue");
  });

  it("paid → Done", () => {
    const q = done();
    const s = state(q, invoice(q.id, { status: "paid", paidAt: daysAgo(1) }));
    expect([s.stage, s.filter, s.pill.text, s.pill.tone]).toEqual(["paid", "done", "Paid", "ok"]);
  });

  it("a cancelled invoice doesn't count: the job reads as not invoiced (like the job page)", () => {
    const q = done();
    const live = liveInvoicesByQuote([invoice(q.id, { status: "cancelled" })]);
    expect(live.has(q.id)).toBe(false);
    expect(state(q, live.get(q.id) ?? null).stage).toBe("not_invoiced");
  });

  it("archived jobs keep their pill but only show under All", () => {
    const q = quote({ status: "completed", archived: true });
    const s = state(q, invoice(q.id, { status: "sent", dueDate: daysAgo(4) }));
    expect(s.filter).toBeNull();
    expect(s.pill.text).toBe("4 days late");
  });
});

describe("invoice helpers", () => {
  it("the earliest live invoice wins; cancelled ones are skipped", () => {
    const first = invoice("q-a", { id: "old", createdAt: daysAgo(9), status: "cancelled" });
    const second = invoice("q-a", { id: "mid", createdAt: daysAgo(5) });
    const third = invoice("q-a", { id: "new", createdAt: daysAgo(1) });
    expect(liveInvoicesByQuote([third, first, second]).get("q-a")?.id).toBe("mid");
  });

  it("invoiceLateDays: only sent or overdue invoices can be late", () => {
    for (const status of ["draft", "paid", "cancelled"] as const) {
      expect(invoiceLateDays(invoice("q", { status, dueDate: daysAgo(20) }), NOW, NZ)).toBeNull();
    }
    expect(invoiceLateDays(invoice("q", { status: "sent", dueDate: null }), NOW, NZ)).toBeNull();
  });

  it("clientFirstName", () => {
    expect(clientFirstName("Sam Taylor")).toBe("Sam");
    expect(clientFirstName("  Aroha,  Ngata ")).toBe("Aroha");
    expect(clientFirstName("TBC")).toBeNull();
    expect(clientFirstName("")).toBeNull();
  });
});

describe("buildJobRows: the list", () => {
  const draftNew = quote({ id: "d-new", status: "draft", createdAt: daysAgo(1) });
  const draftOld = quote({ id: "d-old", status: "draft", createdAt: daysAgo(9) });
  const waitLong = quote({ id: "w-long", status: "sent", sentAt: daysAgo(8), createdAt: daysAgo(9) });
  const waitShort = quote({ id: "w-short", status: "viewed", sentAt: daysAgo(2), createdAt: daysAgo(30) });
  const started = quote({ id: "b-started", status: "in_progress", startedAt: daysAgo(3) });
  const accepted = quote({ id: "b-accepted", status: "accepted", acceptedAt: daysAgo(2) });
  const soon = quote({ id: "b-soon", status: "scheduled", scheduledFor: "2026-09-28" });
  const later = quote({ id: "b-later", status: "scheduled", scheduledFor: "2026-10-12" });
  const late9 = quote({ id: "u-late9", status: "completed", completedAt: daysAgo(20) });
  const late2 = quote({ id: "u-late2", status: "completed", completedAt: daysAgo(20) });
  const notInvoiced = quote({ id: "u-none", status: "completed", completedAt: daysAgo(4) });
  const sentOk = quote({ id: "u-sent", status: "completed", completedAt: daysAgo(6) });
  const paidRecent = quote({ id: "p-recent", status: "completed", total: 900 });
  const paidOld = quote({ id: "p-old", status: "completed" });
  const declined = quote({ id: "x-declined", status: "declined" });
  const archived = quote({ id: "x-archived", status: "draft", archived: true });
  const quotes = [
    draftNew, draftOld, waitLong, waitShort, started, accepted, soon, later,
    late9, late2, notInvoiced, sentOk, paidRecent, paidOld, declined, archived,
  ];
  const invoices = [
    invoice(late9.id, { status: "sent", dueDate: daysAgo(9) }),
    invoice(late2.id, { status: "overdue", dueDate: daysAgo(2) }),
    invoice(sentOk.id, { status: "sent", dueDate: daysAgo(-5) }),
    invoice(paidRecent.id, { status: "paid", paidAt: daysAgo(1), total: 1035 }),
    invoice(paidOld.id, { status: "paid", paidAt: daysAgo(40) }),
  ];
  const rows = buildJobRows(quotes, invoices, NOW, NZ);
  const ids = (filter: JobFilter) => rowsForFilter(rows, filter).map((r) => r.id);

  it("one row per quote, each pointing at its job page", () => {
    expect(rows).toHaveLength(quotes.length);
    expect(rows.find((r) => r.id === "d-new")?.href).toBe("/app/quotes/preview/d-new");
  });

  it("All is newest first and includes declined and archived jobs", () => {
    expect(ids("all")[0]).toBe("d-new");
    expect(ids("all")).toEqual(expect.arrayContaining(["x-declined", "x-archived"]));
  });

  it("To send: drafts, newest first (archived left out)", () => {
    expect(ids("to-send")).toEqual(["d-new", "d-old"]);
  });

  it("Waiting: sent and seen, waiting longest first", () => {
    expect(ids("waiting")).toEqual(["w-long", "w-short"]);
  });

  it("Booked: started, then accepted without a date, then by job date", () => {
    expect(ids("booked")).toEqual(["b-started", "b-accepted", "b-soon", "b-later"]);
  });

  it("Unpaid: most days late first, then not invoiced, then sent by due date", () => {
    expect(ids("unpaid")).toEqual(["u-late9", "u-late2", "u-none", "u-sent"]);
  });

  it("Done: paid jobs, most recently paid first", () => {
    expect(ids("done")).toEqual(["p-recent", "p-old"]);
  });

  it("amount is the invoice once there is one, the quote before", () => {
    expect(rows.find((r) => r.id === "p-recent")?.amount).toBe(1035);
    expect(rows.find((r) => r.id === "d-new")?.amount).toBe(1000);
  });

  it("counts per filter", () => {
    expect(filterCounts(rows)).toEqual({ all: 16, "to-send": 2, waiting: 2, booked: 4, unpaid: 4, done: 2 });
  });

  it("placeholder client names and long jobs are tidied for the row", () => {
    const [row] = buildJobRows(
      [quote({ clientName: "to be confirmed", jobSummary: `  Reline  ${"x".repeat(200)}` })],
      [],
      NOW,
      NZ,
    );
    expect(row.client).toBe("No client name yet");
    expect(row.job.startsWith("Reline x")).toBe(true);
    expect(row.job.length).toBeLessThanOrEqual(140);
    expect(row.job.endsWith("…")).toBe(true);
  });
});

describe("search", () => {
  const [row] = buildJobRows([quote({ clientName: "Ben Walker", jobSummary: "Fence repair, 12 m" })], [], NOW, NZ);
  it("matches client or job, any case, every word", () => {
    expect(matchesSearch(row, "")).toBe(true);
    expect(matchesSearch(row, "walker")).toBe(true);
    expect(matchesSearch(row, "FENCE")).toBe(true);
    expect(matchesSearch(row, "ben fence")).toBe(true);
    expect(matchesSearch(row, "ben deck")).toBe(false);
  });
});

describe("filters and links", () => {
  it("parses ?show= safely", () => {
    for (const { id } of JOB_FILTERS) expect(parseJobFilter(id)).toBe(id);
    expect(parseJobFilter("paid")).toBe("all");
    expect(parseJobFilter(undefined)).toBe("all");
    expect(parseJobFilter(["unpaid"])).toBe("all");
  });

  it("jobsHref", () => {
    expect(jobsHref("all")).toBe("/app/jobs");
    expect(jobsHref("unpaid")).toBe("/app/jobs?show=unpaid");
  });

  it("old quote stages map to the matching filter", () => {
    expect(jobsFilterForQuoteStage("draft")).toBe("to-send");
    expect(jobsFilterForQuoteStage("sent")).toBe("waiting");
    expect(jobsFilterForQuoteStage("viewed")).toBe("waiting");
    expect(jobsFilterForQuoteStage("accepted")).toBe("booked");
    expect(jobsFilterForQuoteStage("scheduled")).toBe("booked");
    expect(jobsFilterForQuoteStage("in_progress")).toBe("booked");
    expect(jobsFilterForQuoteStage("completed")).toBe("unpaid");
    expect(jobsFilterForQuoteStage("declined")).toBe("all");
    expect(jobsFilterForQuoteStage(null)).toBe("all");
  });

  it("old invoice statuses map to Unpaid or Done", () => {
    expect(jobsFilterForInvoiceStatus("paid")).toBe("done");
    for (const s of ["draft", "sent", "overdue", "cancelled", null]) expect(jobsFilterForInvoiceStatus(s)).toBe("unpaid");
  });

  it("with the new look off, /app/jobs hands over to the old lists", () => {
    expect(oldLookHrefForJobs("all")).toBe("/app/quotes");
    expect(oldLookHrefForJobs("to-send")).toBe("/app/quotes?stage=draft");
    expect(oldLookHrefForJobs("waiting")).toBe("/app/quotes");
    expect(oldLookHrefForJobs("booked")).toBe("/app/quotes");
    expect(oldLookHrefForJobs("unpaid")).toBe("/app/invoices");
    expect(oldLookHrefForJobs("done")).toBe("/app/invoices?status=paid");
  });
});

describe("colour and initials (round two)", () => {
  it("every filter has its colour; All stays neutral", () => {
    expect(FILTER_TONE).toEqual({ all: "neutral", "to-send": "brand", waiting: "warn", booked: "info", unpaid: "bad", done: "ok" });
  });
  it("client initials: first and last word, capitals, ? with no name", () => {
    expect(clientInitials("Hemi Walker")).toBe("HW");
    expect(clientInitials("sarah jane tane")).toBe("ST");
    expect(clientInitials("Bunnings")).toBe("B");
    expect(clientInitials("Ōtūmoetai School")).toBe("ŌS");
    expect(clientInitials(NO_CLIENT_NAME)).toBe("?");
    expect(clientInitials("   ")).toBe("?");
    expect(clientInitials("(Mr) Ben & Co")).toBe("MC");
  });
  it("a client keeps one colour; no name is neutral", () => {
    expect(clientTone("Hemi Walker")).toBe(clientTone("hemi walker"));
    expect(["violet", "info", "ok", "warn", "brand"]).toContain(clientTone("Hemi Walker"));
    expect(clientTone(NO_CLIENT_NAME)).toBe("neutral");
  });
});
