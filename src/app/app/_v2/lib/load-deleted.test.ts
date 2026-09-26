// Recently deleted: the read, and deleted jobs staying out of the board,
// the money tiles and the to-dos.

import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ errors: [] as unknown[] }));
vi.mock("@/lib/observability", () => ({
  captureError: (error: unknown) => void captured.errors.push(error),
}));

import { fakeBoardDb, type BoardDbQuery } from "@/test/fake-board-db";
import { NOW, NZ, daysAgo } from "./fixtures";
import { buildTodos, moneyTiles } from "./home-todos";
import { CO_DELETED_WITHIN_MS, DELETED_JOBS_DAYS, buildDeletedJobRows, buildJobRows } from "./job-board";
import {
  BOARD_INVOICE_LIMIT,
  DELETED_QUOTE_LIMIT,
  INVOICE_COLUMNS,
  QUOTE_COLUMNS,
  loadBoard,
  loadDeletedJobs,
} from "./load-board";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  captured.errors = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadDeletedJobs: the read", () => {
  it("the user's own jobs deleted in the last 90 days, newest deletion first", async () => {
    const db = fakeBoardDb({ quotes: { data: [] }, invoices: { data: [] } });
    await expect(loadDeletedJobs(db, "user-1", NOW)).resolves.toEqual({ quotes: [], invoices: [], failed: false });
    const since = new Date(NOW.getTime() - DELETED_JOBS_DAYS * DAY_MS).toISOString();
    const [quotes, invoices] = db.queries;
    expect(quotes).toMatchObject({
      table: "quotes",
      columns: `${QUOTE_COLUMNS}, deleted_at`,
      filters: [
        ["eq", "user_id", "user-1"],
        ["gt", "deleted_at", since],
      ],
      order: ["deleted_at", { ascending: false }],
      limit: DELETED_QUOTE_LIMIT,
    });
    // Invoices a few seconds further back, so one deleted with the oldest job still pairs up.
    expect(invoices).toMatchObject({
      table: "invoices",
      columns: `${INVOICE_COLUMNS}, deleted_at`,
      filters: [
        ["eq", "user_id", "user-1"],
        ["gt", "deleted_at", new Date(Date.parse(since) - CO_DELETED_WITHIN_MS).toISOString()],
      ],
      limit: BOARD_INVOICE_LIMIT,
    });
  });

  it("keeps each row's delete time", async () => {
    const db = fakeBoardDb({
      quotes: {
        data: [
          { id: "q1", status: "completed", total_amount: "900", deleted_at: "2026-09-22T00:00:00Z", client_name: "Ben" },
          { id: "q2", status: "draft", deleted_at: null },
        ],
      },
      invoices: { data: [{ id: "i1", quote_id: "q1", status: "paid", deleted_at: "2026-09-22T00:00:00Z" }] },
    });
    const deleted = await loadDeletedJobs(db, "user-1", NOW);
    expect(deleted.quotes).toHaveLength(1);
    expect(deleted.quotes[0]).toMatchObject({ id: "q1", total: 900, clientName: "Ben", deletedAt: "2026-09-22T00:00:00Z" });
    expect(deleted.invoices[0]).toMatchObject({ id: "i1", quoteId: "q1", deletedAt: "2026-09-22T00:00:00Z" });
  });

  it("a failed read is reported, and says so", async () => {
    const db = fakeBoardDb({ quotes: { error: { message: "boom" } }, invoices: { data: [] } });
    await expect(loadDeletedJobs(db, "user-1", NOW)).resolves.toEqual({ quotes: [], invoices: [], failed: true });
    expect(captured.errors).toHaveLength(1);
  });
});

/** A tiny in-memory database that honours the filters the board reads use. */
function tableOf(rows: Array<Record<string, unknown>>) {
  return (query: BoardDbQuery) => ({
    data: rows.filter((row) =>
      query.filters.every(([method, column, value]) => {
        const cell = row[column] ?? null;
        if (method === "eq") return cell === value;
        if (method === "is") return cell === value;
        if (method === "gt") return typeof cell === "string" && Date.parse(cell) > Date.parse(String(value));
        throw new Error(`unexpected filter ${method}`);
      }),
    ),
  });
}

describe("a deleted job is out of Jobs, the totals and the to-dos, and in Recently deleted", () => {
  const deletedAt = daysAgo(2);
  const quoteRow = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    user_id: "user-1",
    status: "completed",
    total_amount: 1000,
    currency: "NZD",
    created_at: daysAgo(40),
    completed_at: daysAgo(20),
    client_name: `Client ${id}`,
    deleted_at: null,
    ...over,
  });
  const invoiceRow = (id: string, quoteId: string, over: Record<string, unknown> = {}) => ({
    id,
    quote_id: quoteId,
    user_id: "user-1",
    invoice_number: id.toUpperCase(),
    status: "sent",
    total_amount: 1150,
    currency: "NZD",
    due_date: daysAgo(10),
    created_at: daysAgo(19),
    deleted_at: null,
    ...over,
  });
  const db = fakeBoardDb({
    quotes: tableOf([
      quoteRow("live"),
      quoteRow("gone", { deleted_at: deletedAt }),
      quoteRow("ancient", { deleted_at: daysAgo(DELETED_JOBS_DAYS + 30) }),
      quoteRow("theirs", { user_id: "user-2", deleted_at: deletedAt }),
    ]),
    invoices: tableOf([
      invoiceRow("live-inv", "live"),
      // Late and unpaid, deleted with its job.
      invoiceRow("gone-late", "gone", { deleted_at: deletedAt }),
      // Paid this month, deleted with its job.
      invoiceRow("gone-paid", "gone", { status: "paid", paid_at: daysAgo(3), created_at: daysAgo(5), deleted_at: deletedAt }),
      // Deleted on its own a month ago: stays deleted when the job comes back.
      invoiceRow("gone-old", "gone", { status: "draft", deleted_at: daysAgo(30) }),
    ]),
  });

  it("Jobs, the money tiles and the to-dos only see the live job", async () => {
    const board = await loadBoard(db, "user-1");
    expect(board.quotes.map((q) => q.id)).toEqual(["live"]);
    expect(board.invoices.map((i) => i.id)).toEqual(["live-inv"]);
    expect(buildJobRows(board.quotes, board.invoices, NOW, NZ).map((r) => r.id)).toEqual(["live"]);
    const tiles = moneyTiles({ invoices: board.invoices, now: NOW, timeZone: NZ, currency: "NZD" });
    expect(tiles.owed).toMatchObject({ amount: 1150, count: 1 });
    expect(tiles.paidThisMonth).toMatchObject({ amount: 0, count: 0 });
    const todos = buildTodos({ quotes: board.quotes, invoices: board.invoices, requests: [], now: NOW, timeZone: NZ });
    expect(todos.map((t) => t.key)).toEqual(["overdue:live-inv"]);
  });

  it("Recently deleted lists it (not older ones, not anyone else's) as it would come back", async () => {
    const board = await loadBoard(db, "user-1");
    const deleted = await loadDeletedJobs(db, "user-1", NOW);
    expect(deleted.quotes.map((q) => q.id)).toEqual(["gone"]);
    const rows = buildDeletedJobRows(deleted.quotes, [...deleted.invoices, ...board.invoices], NOW, NZ);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "gone", deletedLabel: "Deleted 2 days ago", invoiceStatus: "sent" });
    expect(rows[0].pill.text).toBe("10 days late");
  });
});
