import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ errors: [] as unknown[] }));
vi.mock("@/lib/observability", () => ({
  captureError: (error: unknown) => void captured.errors.push(error),
}));

import { fakeBoardDb } from "@/test/fake-board-db";
import {
  BOARD_QUOTE_LIMIT,
  INVOICE_COLUMNS,
  QUOTE_COLUMNS,
  loadBoard,
  loadHomeExtras,
  toBoardInvoice,
  toBoardQuote,
} from "./load-board";

beforeEach(() => {
  captured.errors = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadBoard: the same scoped reads as the old lists", () => {
  it("reads only the user's own rows that aren't deleted, newest first", async () => {
    const db = fakeBoardDb({ quotes: { data: [] }, invoices: { data: [] } });
    const board = await loadBoard(db, "user-1");
    expect(board).toEqual({ quotes: [], invoices: [], failed: false });
    const [quotes, invoices] = db.queries;
    expect(quotes).toMatchObject({
      table: "quotes",
      columns: QUOTE_COLUMNS,
      filters: [
        ["eq", "user_id", "user-1"],
        ["is", "deleted_at", null],
      ],
      order: ["created_at", { ascending: false }],
      limit: BOARD_QUOTE_LIMIT,
    });
    expect(invoices).toMatchObject({
      table: "invoices",
      columns: INVOICE_COLUMNS,
      filters: [
        ["eq", "user_id", "user-1"],
        ["is", "deleted_at", null],
      ],
    });
    // Narrow JSON paths, never the whole quote_data blob.
    expect(QUOTE_COLUMNS).toContain("job_summary:quote_data->>job_summary");
    expect(QUOTE_COLUMNS).toContain("client_name:quote_data->client->>name");
    expect(QUOTE_COLUMNS).not.toMatch(/quote_data(,|$)/);
  });

  it("maps rows safely", () => {
    expect(
      toBoardQuote({
        id: "q1",
        status: "sent",
        total_amount: "4830.5",
        currency: null,
        created_at: "2026-09-20T00:00:00Z",
        sent_at: "2026-09-21T00:00:00Z",
        archived_at: "2026-09-22T00:00:00Z",
        client_name: "Sam Taylor",
        job_summary: "",
      }),
    ).toMatchObject({ id: "q1", status: "sent", total: 4830.5, currency: "NZD", archived: true, jobSummary: null });
    expect(
      toBoardInvoice({ id: "i1", quote_id: "q1", status: "paid", total_amount: "abc", paid_at: "2026-09-23T00:00:00Z" }),
    ).toMatchObject({ id: "i1", quoteId: "q1", status: "paid", total: 0, paidAt: "2026-09-23T00:00:00Z" });
  });

  it("a failed read says so (and is reported) rather than showing a wrong board", async () => {
    const db = fakeBoardDb({ quotes: { data: [{ id: "q1" }] }, invoices: { error: { message: "boom" } } });
    const board = await loadBoard(db, "user-1");
    expect(board).toEqual({ quotes: [], invoices: [], failed: true });
    expect(captured.errors).toHaveLength(1);
  });
});

describe("loadHomeExtras", () => {
  const answers = () => ({
    profiles: {
      data: {
        business_name: "STR8 Builders",
        logo_url: null,
        default_labour_rate: "85",
        address: "1 Cameron Rd, Tauranga",
        country: "NZ",
        currency: "NZD",
      },
    },
    materials: { count: 5 },
    quote_requests: {
      data: [
        {
          id: "r1",
          quote_id: "q1",
          client_name: "Aroha",
          description: "Bathroom",
          status: "generated",
          created_at: "2026-09-24T00:00:00Z",
        },
      ],
    },
  });

  it("reads the profile by id, counts priced materials, and lists open requests", async () => {
    const db = fakeBoardDb(answers());
    const extras = await loadHomeExtras(db, "user-1", { withSetup: true });
    expect(extras.profile).toEqual({
      businessName: "STR8 Builders",
      logoUrl: null,
      labourRate: 85,
      address: "1 Cameron Rd, Tauranga",
      country: "NZ",
      currency: "NZD",
    });
    expect(extras.pricedMaterials).toBe(5);
    expect(extras.requests).toEqual([
      {
        id: "r1",
        quoteId: "q1",
        clientName: "Aroha",
        description: "Bathroom",
        status: "generated",
        createdAt: "2026-09-24T00:00:00Z",
      },
    ]);
    const byTable = Object.fromEntries(db.queries.map((q) => [q.table, q]));
    expect(byTable.profiles).toMatchObject({ filters: [["eq", "id", "user-1"]], terminal: "maybeSingle" });
    expect(byTable.materials).toMatchObject({
      options: { count: "exact", head: true },
      filters: [
        ["eq", "user_id", "user-1"],
        ["gt", "default_unit_price", 0],
      ],
    });
    expect(byTable.quote_requests.filters).toEqual([
      ["eq", "user_id", "user-1"],
      ["in", "status", ["new", "generated", "generation_failed"]],
    ]);
  });

  it("skips the materials count once the setup card is hidden", async () => {
    const db = fakeBoardDb(answers());
    const extras = await loadHomeExtras(db, "user-1", { withSetup: false });
    expect(extras.pricedMaterials).toBeNull();
    expect(db.queries.some((q) => q.table === "materials")).toBe(false);
  });

  it("a brand-new account has no profile row yet", async () => {
    const db = fakeBoardDb({ profiles: { data: null }, materials: { count: 0 }, quote_requests: { data: [] } });
    const extras = await loadHomeExtras(db, "user-1", { withSetup: true });
    expect(extras.profile).toEqual({
      businessName: null,
      logoUrl: null,
      labourRate: null,
      address: null,
      country: null,
      currency: null,
    });
    expect(extras.pricedMaterials).toBe(0);
  });
});
