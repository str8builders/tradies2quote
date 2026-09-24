import { describe, expect, it } from "vitest";
import { NOW, NZ, daysAgo, invoice, quote, request } from "./fixtures";
import {
  FOLLOW_UP_AFTER_DAYS,
  buildTodos,
  moneyTiles,
  todoSummary,
  type BoardRequest,
  type Todo,
} from "./home-todos";
import type { BoardInvoice, BoardQuote } from "./job-board";

function todos(quotes: BoardQuote[], invoices: BoardInvoice[] = [], requests: BoardRequest[] = []): Todo[] {
  return buildTodos({ quotes, invoices, requests, now: NOW, timeZone: NZ });
}

const only = (list: Todo[]) => {
  expect(list).toHaveLength(1);
  return list[0];
};

describe("each card type: what happened, who and how much, one action", () => {
  it("overdue invoice → Send a reminder, on the job page", () => {
    const q = quote({ id: "fence", status: "completed", clientName: "Ben Walker", jobSummary: "Fence repair" });
    const card = only(todos([q], [invoice("fence", { status: "sent", total: 1240, dueDate: daysAgo(9) })]));
    expect(card).toMatchObject({
      kind: "overdue",
      title: "$1,240.00 is 9 days late",
      detail: "Ben Walker · Fence repair",
      action: { label: "Send a reminder", href: "/app/quotes/preview/fence" },
      tone: "bad",
    });
  });

  it("an invoice marked overdue before its date says overdue", () => {
    const q = quote({ id: "a", status: "completed" });
    const card = only(todos([q], [invoice("a", { status: "overdue", total: 500, dueDate: daysAgo(-1) })]));
    expect(card.title).toBe("$500.00 is overdue");
  });

  it("client request with its draft → Check and send, on the job page", () => {
    const draft = quote({ id: "bath", status: "draft", total: 3960, clientName: "Aroha Ngata" });
    const card = only(todos([draft], [], [request({ quoteId: "bath", clientName: "Aroha Ngata" })]));
    expect(card).toMatchObject({
      kind: "request",
      title: "New job request",
      detail: "Aroha Ngata · $3,960.00",
      action: { label: "Check and send", href: "/app/quotes/preview/bath" },
      tone: "brand",
    });
  });

  it("client request whose draft isn't priced yet shows what they asked for", () => {
    const draft = quote({ id: "bath", status: "draft", total: 0, jobSummary: null });
    const card = only(todos([draft], [], [request({ quoteId: "bath", description: "Bathroom reline" })]));
    expect(card.detail).toBe("Aroha Ngata · Bathroom reline");
  });

  it("client request with no draft yet → Open request", () => {
    const card = only(todos([], [], [request({ quoteId: null, status: "new" })]));
    expect(card).toMatchObject({
      kind: "request",
      detail: "Aroha Ngata · Bathroom reline, about 6 sheets of aqualine",
      action: { label: "Open request", href: "/app/requests" },
    });
  });

  it("finished job with no invoice → Send invoice", () => {
    const q = quote({ id: "deck", status: "completed", total: 4830, completedAt: daysAgo(1) });
    expect(only(todos([q]))).toMatchObject({
      kind: "invoice",
      title: "Job done, not invoiced yet",
      detail: "Sam Taylor · $4,830.00",
      action: { label: "Send invoice", href: "/app/quotes/preview/deck" },
      tone: "ok",
    });
  });

  it("finished job with a draft invoice → Send invoice (for the invoice amount)", () => {
    const q = quote({ id: "deck", status: "completed", total: 4200 });
    expect(only(todos([q], [invoice("deck", { status: "draft", total: 4830 })]))).toMatchObject({
      kind: "invoice",
      title: "Invoice not sent yet",
      detail: "Sam Taylor · $4,830.00",
      action: { label: "Send invoice" },
    });
  });

  it("started job → Send invoice", () => {
    const q = quote({ id: "roof", status: "in_progress", startedAt: daysAgo(3) });
    expect(only(todos([q]))).toMatchObject({
      kind: "invoice",
      title: "Job started 3 days ago",
      action: { label: "Send invoice", href: "/app/quotes/preview/roof" },
    });
    expect(only(todos([quote({ status: "in_progress", startedAt: null })])).title).toBe("Job under way");
  });

  it("accepted, not booked → Book the job", () => {
    const q = quote({ id: "tile", status: "accepted", acceptedAt: daysAgo(1) });
    expect(only(todos([q]))).toMatchObject({
      kind: "book",
      title: "Quote accepted yesterday",
      detail: "Sam Taylor · $1,000.00",
      action: { label: "Book the job", href: "/app/quotes/preview/tile" },
      tone: "ok",
    });
    expect(only(todos([quote({ status: "accepted", acceptedAt: daysAgo(0) })])).title).toBe("Quote accepted today");
  });

  it(`sent ${FOLLOW_UP_AFTER_DAYS}+ days with no answer → Follow up`, () => {
    const q = quote({ id: "gate", status: "sent", sentAt: daysAgo(5) });
    expect(only(todos([q]))).toMatchObject({
      kind: "follow_up",
      title: "No answer for 5 days",
      action: { label: "Follow up", href: "/app/quotes/preview/gate" },
      tone: "warn",
    });
    const seen = quote({ status: "viewed", sentAt: daysAgo(3), viewedAt: daysAgo(1) });
    expect(only(todos([seen])).title).toBe("Seen, no answer for 3 days");
  });

  it("sent less than 3 days ago: nothing to do yet", () => {
    expect(todos([quote({ status: "sent", sentAt: daysAgo(2) })])).toEqual([]);
  });

  it("draft → Check and send", () => {
    const q = quote({ id: "bath", status: "draft", total: 3960 });
    expect(only(todos([q]))).toMatchObject({
      kind: "draft",
      title: "Quote ready to send",
      detail: "Sam Taylor · $3,960.00",
      action: { label: "Check and send", href: "/app/quotes/preview/bath" },
      tone: "brand",
    });
  });

  it("no client name: the job stands in", () => {
    const q = quote({ status: "draft", clientName: "To be confirmed", jobSummary: "Deck at 14 Rata St", total: 0 });
    expect(only(todos([q])).detail).toBe("Deck at 14 Rata St");
  });
});

describe("what is left off", () => {
  it("scheduled, declined, expired, paid and invoiced-not-yet-due jobs need nothing today", () => {
    const paid = quote({ id: "p", status: "completed" });
    const sent = quote({ id: "s", status: "completed" });
    const list = todos(
      [quote({ status: "scheduled" }), quote({ status: "declined" }), quote({ status: "expired" }), paid, sent],
      [invoice("p", { status: "paid", paidAt: daysAgo(1) }), invoice("s", { status: "sent", dueDate: daysAgo(-4) })],
    );
    expect(list).toEqual([]);
  });

  it("a completed job whose invoice was cancelled is back to Send invoice", () => {
    const q = quote({ id: "c", status: "completed" });
    expect(only(todos([q], [invoice("c", { status: "cancelled" })])).title).toBe("Job done, not invoiced yet");
  });

  it("archived jobs are skipped, but their late invoice still is a reminder", () => {
    const archivedDraft = quote({ status: "draft", archived: true });
    const archivedDone = quote({ id: "ad", status: "completed", archived: true });
    const list = todos([archivedDraft, archivedDone], [invoice("ad", { status: "sent", dueDate: daysAgo(3) })]);
    expect(list.map((t) => t.kind)).toEqual(["overdue"]);
  });

  it("an invoice whose job was deleted has no page to open, so no card", () => {
    expect(todos([], [invoice("gone", { status: "sent", dueDate: daysAgo(3) })])).toEqual([]);
  });

  it("a request's draft shows once, as the request", () => {
    const draft = quote({ id: "bath", status: "draft" });
    const list = todos([draft], [], [request({ quoteId: "bath" })]);
    expect(list.map((t) => t.kind)).toEqual(["request"]);
  });

  it("requests already dealt with are left off: quote sent, deleted or archived, or dismissed", () => {
    const sent = quote({ id: "sent", status: "sent", sentAt: daysAgo(1) });
    const archived = quote({ id: "arch", status: "draft", archived: true });
    const list = todos(
      [sent, archived],
      [],
      [
        request({ quoteId: "sent" }),
        request({ quoteId: "deleted" }),
        request({ quoteId: "arch" }),
        request({ status: "dismissed" }),
      ],
    );
    expect(list.map((t) => t.kind)).toEqual([]);
  });
});

describe("order: most urgent first", () => {
  it("overdue → requests → invoice → book → follow up → drafts", () => {
    const list = todos(
      [
        quote({ id: "draft", status: "draft" }),
        quote({ id: "follow", status: "sent", sentAt: daysAgo(4) }),
        quote({ id: "book", status: "accepted", acceptedAt: daysAgo(1) }),
        quote({ id: "invoice", status: "completed" }),
        quote({ id: "late", status: "completed" }),
      ],
      [invoice("late", { status: "sent", dueDate: daysAgo(2) })],
      [request({ quoteId: null })],
    );
    expect(list.map((t) => t.kind)).toEqual(["overdue", "request", "invoice", "book", "follow_up", "draft"]);
  });

  it("inside a kind: most late, oldest request, finished before started, longest waiting, newest draft", () => {
    const late = todos(
      [quote({ id: "a", status: "completed" }), quote({ id: "b", status: "completed" })],
      [invoice("a", { status: "sent", dueDate: daysAgo(2) }), invoice("b", { status: "sent", dueDate: daysAgo(12) })],
    );
    expect(late.map((t) => t.key)).toEqual([expect.stringContaining("inv-"), expect.stringContaining("inv-")]);
    expect(late[0].title).toContain("12 days");

    const reqs = todos([], [], [request({ id: "new", createdAt: daysAgo(0) }), request({ id: "old", createdAt: daysAgo(3) })]);
    expect(reqs.map((t) => t.key)).toEqual(["request:old", "request:new"]);

    const inv = todos([
      quote({ id: "started", status: "in_progress", startedAt: daysAgo(9) }),
      quote({ id: "done", status: "completed", completedAt: daysAgo(1) }),
    ]);
    expect(inv.map((t) => t.key)).toEqual(["invoice:done", "invoice:started"]);

    const follow = todos([
      quote({ id: "f3", status: "sent", sentAt: daysAgo(3) }),
      quote({ id: "f8", status: "sent", sentAt: daysAgo(8) }),
    ]);
    expect(follow.map((t) => t.key)).toEqual(["follow_up:f8", "follow_up:f3"]);

    const drafts = todos([
      quote({ id: "older", status: "draft", createdAt: daysAgo(6) }),
      quote({ id: "newer", status: "draft", createdAt: daysAgo(1) }),
    ]);
    expect(drafts.map((t) => t.key)).toEqual(["draft:newer", "draft:older"]);
  });
});

describe("summary line", () => {
  it("reads naturally", () => {
    expect(todoSummary(0)).toBe("Nothing needs you right now");
    expect(todoSummary(1)).toBe("1 thing needs you today");
    expect(todoSummary(3)).toBe("3 things need you today");
  });
});

describe("money tiles", () => {
  const base = { now: NOW, timeZone: NZ, currency: "NZD" };

  it("owed to you = sent + overdue invoices; paid this month counts from the 1st in NZ", () => {
    const tiles = moneyTiles({
      ...base,
      invoices: [
        invoice("a", { status: "sent", total: 1000 }),
        invoice("b", { status: "overdue", total: 240 }),
        invoice("c", { status: "draft", total: 999 }),
        invoice("d", { status: "cancelled", total: 999 }),
        invoice("e", { status: "paid", total: 500, paidAt: "2026-09-02T01:00:00.000Z" }),
        // 31 August 23:00 UTC is 1 September 11 am in NZ: this month.
        invoice("f", { status: "paid", total: 100, paidAt: "2026-08-31T23:00:00.000Z" }),
        // 31 August 11:00 UTC is still 31 August in NZ: last month.
        invoice("g", { status: "paid", total: 700, paidAt: "2026-08-31T11:00:00.000Z" }),
      ],
    });
    expect(tiles.owed).toEqual({ amount: 1240, count: 2, currency: "NZD", otherCurrencies: 0 });
    expect(tiles.paidThisMonth).toEqual({ amount: 600, count: 2, currency: "NZD", otherCurrencies: 0 });
  });

  it("nothing yet: zero in the business's currency", () => {
    expect(moneyTiles({ ...base, currency: "AUD", invoices: [] }).owed).toEqual({
      amount: 0,
      count: 0,
      currency: "AUD",
      otherCurrencies: 0,
    });
  });

  it("mixed currencies: the most common one is summed, the rest are counted apart", () => {
    const tiles = moneyTiles({
      ...base,
      invoices: [
        invoice("a", { status: "sent", total: 100, currency: "AUD" }),
        invoice("b", { status: "sent", total: 200, currency: "AUD" }),
        invoice("c", { status: "sent", total: 300, currency: "NZD" }),
      ],
    });
    expect(tiles.owed).toEqual({ amount: 300, count: 2, currency: "AUD", otherCurrencies: 1 });
  });
});
