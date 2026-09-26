// deleteJobs / restoreJobs: scoped to the signed-in user, capped, quotes and
// invoices together, and only the invoices deleted with a job come back.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  user: null as { id: string } | null,
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  db: null as ReturnType<typeof fakeSupabase> | null,
  revalidated: [] as string[],
  captured: [] as unknown[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => void env.revalidated.push(path),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/observability", () => ({
  captureError: (error: unknown) => void env.captured.push(error),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    env.db = fakeSupabase((op) => env.respond(op));
    return {
      auth: { getUser: async () => ({ data: { user: env.user } }) },
      from: env.db.from,
    };
  },
}));

import { deleteJobs, restoreJobs } from "./actions";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = uuid(1);
const B = uuid(2);
const C = uuid(3);

const ops = () => env.db!.ops;
const writes = () => ops().filter((op) => op.action !== "select");
const inValue = (op: FakeOp, column: string) =>
  op.filters.find(([method, name]) => method === "in" && name === column)?.[2] as string[] | undefined;
/** Answer an update with the rows its `in` filter names (as if all changed). */
const echoIds = (op: FakeOp) => ({ data: (inValue(op, "id") ?? []).map((id) => ({ id })) });

beforeEach(() => {
  env.user = { id: "owner-1" };
  env.respond = () => undefined;
  env.db = null;
  env.revalidated = [];
  env.captured = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("deleteJobs", () => {
  it("deletes the quotes and all their invoices, one time stamp, this user only", async () => {
    env.respond = (op) => (op.table === "quotes" ? echoIds(op) : { data: [] });
    const result = await deleteJobs([A, B]);
    expect(result).toEqual({ ok: true, count: 2, ids: [A, B] });

    const [quotes, invoices] = ops();
    expect(ops()).toHaveLength(2);
    expect(quotes).toMatchObject({
      table: "quotes",
      action: "update",
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "id", [A, B]],
        ["is", "deleted_at", null],
      ],
    });
    const at = (quotes.values as { deleted_at: string }).deleted_at;
    expect(Number.isNaN(Date.parse(at))).toBe(false);
    expect(invoices).toMatchObject({
      table: "invoices",
      action: "update",
      values: { deleted_at: at },
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "quote_id", [A, B]],
        ["is", "deleted_at", null],
      ],
    });
    expect(env.revalidated).toEqual(["/app/jobs", "/app"]);
  });

  it("only the jobs it actually deleted take their invoices (already gone, or not yours: untouched)", async () => {
    env.respond = (op) => (op.table === "quotes" ? { data: [{ id: A }] } : { data: [] });
    await expect(deleteJobs([A, B, C])).resolves.toEqual({ ok: true, count: 1, ids: [A] });
    expect(inValue(ops()[1], "quote_id")).toEqual([A]);
  });

  it("nothing left to delete: no invoice write", async () => {
    env.respond = () => ({ data: [] });
    await expect(deleteJobs([A])).resolves.toEqual({ ok: true, count: 0, ids: [] });
    expect(ops()).toHaveLength(1);
  });

  it("ids are tidied: trimmed, lower case, once each", async () => {
    env.respond = (op) => (op.table === "quotes" ? echoIds(op) : { data: [] });
    await deleteJobs([A.toUpperCase(), ` ${A} `, B]);
    expect(inValue(ops()[0], "id")).toEqual([A, B]);
  });

  it("refuses bad input before touching the database", async () => {
    const tooMany = Array.from({ length: 201 }, (_, i) => uuid(i + 10));
    for (const bad of [[], ["not-an-id"], [A, "7"], tooMany, "abc" as unknown as string[]]) {
      const result = await deleteJobs(bad);
      expect(result.ok).toBe(false);
    }
    expect(env.db).toBeNull();
  });

  it("sends a signed-out caller to sign in, writing nothing", async () => {
    env.user = null;
    await expect(deleteJobs([A])).rejects.toThrow("NEXT_REDIRECT /login");
    expect(ops()).toHaveLength(0);
  });

  it("a failed delete says so in plain words and is reported", async () => {
    env.respond = () => ({ error: { message: "boom" } });
    const result = await deleteJobs([A]);
    expect(result).toEqual({ ok: false, error: "Couldn't delete those jobs. Check your signal and try again." });
    expect(env.captured).toHaveLength(1);
    expect(env.revalidated).toEqual([]);
    expect(ops()).toHaveLength(1);
  });

  it("if the invoices can't go, the jobs come back (never gone while their invoices still count)", async () => {
    env.respond = (op) => {
      if (op.table === "quotes" && op.action === "update" && (op.values as { deleted_at: unknown }).deleted_at) {
        return echoIds(op);
      }
      if (op.table === "invoices" && (op.values as { deleted_at: unknown }).deleted_at) return { error: { message: "boom" } };
      return { data: [] };
    };
    const result = await deleteJobs([A, B]);
    expect(result.ok).toBe(false);
    const at = (ops()[0].values as { deleted_at: string }).deleted_at;
    const undo = writes().slice(2);
    expect(undo).toEqual([
      expect.objectContaining({
        table: "invoices",
        values: { deleted_at: null },
        filters: [
          ["eq", "user_id", "owner-1"],
          ["in", "quote_id", [A, B]],
          ["eq", "deleted_at", at],
        ],
      }),
      expect.objectContaining({
        table: "quotes",
        values: { deleted_at: null },
        filters: [
          ["eq", "user_id", "owner-1"],
          ["in", "id", [A, B]],
          ["eq", "deleted_at", at],
        ],
      }),
    ]);
    expect(env.captured.length).toBeGreaterThanOrEqual(1);
    expect(env.revalidated).toEqual([]);
  });

  it("long selections go in parts (short URLs), all with the same time", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => uuid(i + 100));
    env.respond = (op) => (op.table === "quotes" ? echoIds(op) : { data: [] });
    await expect(deleteJobs(ids)).resolves.toMatchObject({ ok: true, count: 150 });
    const quoteWrites = ops().filter((op) => op.table === "quotes");
    const invoiceWrites = ops().filter((op) => op.table === "invoices");
    expect(quoteWrites.map((op) => inValue(op, "id")?.length)).toEqual([100, 50]);
    expect(invoiceWrites.map((op) => inValue(op, "quote_id")?.length)).toEqual([100, 50]);
    const times = new Set(ops().map((op) => (op.values as { deleted_at: string }).deleted_at));
    expect(times.size).toBe(1);
  });
});

describe("restoreJobs", () => {
  const T = "2026-09-20T01:00:00.000Z";
  const T2 = "2026-09-22T05:30:00.000Z";
  const later = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

  /** A: deleted at T; B: deleted at T2. Their invoices, deleted at various times. */
  function script(overrides: { invoiceUpdate?: FakeResult } = {}) {
    return (op: FakeOp): FakeResult => {
      if (op.table === "quotes" && op.action === "select") {
        return {
          data: [
            { id: A, deleted_at: T },
            { id: B, deleted_at: T2 },
          ],
        };
      }
      if (op.table === "invoices" && op.action === "select") {
        return {
          data: [
            { id: "inv-a1", quote_id: A, deleted_at: T },
            { id: "inv-a0", quote_id: A, deleted_at: later(T, -2 * 24 * 3600 * 1000) },
            { id: "inv-b1", quote_id: B, deleted_at: later(T2, 3_000) },
            { id: "inv-b2", quote_id: B, deleted_at: later(T2, 60_000) },
          ],
        };
      }
      if (op.table === "quotes" && op.action === "update") return echoIds(op);
      if (op.table === "invoices" && op.action === "update") return overrides.invoiceUpdate ?? { data: [] };
      return { data: [] };
    };
  }

  it("brings back the jobs and only the invoices deleted with them", async () => {
    env.respond = script();
    await expect(restoreJobs([A, B])).resolves.toEqual({ ok: true, count: 2, ids: [A, B] });
    const [readQuotes, readInvoices, quotes, invoices] = ops();
    expect(ops()).toHaveLength(4);
    expect(readQuotes).toMatchObject({
      table: "quotes",
      action: "select",
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "id", [A, B]],
        ["not", "deleted_at", "is"],
      ],
    });
    expect(readInvoices).toMatchObject({
      table: "invoices",
      action: "select",
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "quote_id", [A, B]],
        ["not", "deleted_at", "is"],
      ],
    });
    expect(quotes).toMatchObject({
      table: "quotes",
      action: "update",
      values: { deleted_at: null },
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "id", [A, B]],
        ["not", "deleted_at", "is"],
      ],
    });
    // Same time as its job, or a few seconds off: back. Two days before, or a minute after: stays deleted.
    expect(invoices).toMatchObject({
      table: "invoices",
      action: "update",
      values: { deleted_at: null },
      filters: [
        ["eq", "user_id", "owner-1"],
        ["in", "id", ["inv-a1", "inv-b1"]],
      ],
    });
    expect(env.revalidated).toEqual(["/app/jobs", "/app"]);
  });

  it("jobs that aren't deleted (or aren't yours) are left alone", async () => {
    env.respond = () => ({ data: [] });
    await expect(restoreJobs([C])).resolves.toEqual({ ok: true, count: 0, ids: [] });
    expect(writes()).toHaveLength(0);
  });

  it("no invoice went with the job: no invoice write", async () => {
    env.respond = (op) => {
      if (op.table === "quotes" && op.action === "select") return { data: [{ id: A, deleted_at: T }] };
      if (op.table === "invoices" && op.action === "select") {
        return { data: [{ id: "inv-a0", quote_id: A, deleted_at: later(T, -86_400_000) }] };
      }
      return op.table === "quotes" ? echoIds(op) : { data: [] };
    };
    await expect(restoreJobs([A])).resolves.toMatchObject({ ok: true, count: 1 });
    expect(writes().map((op) => op.table)).toEqual(["quotes"]);
  });

  it("if the invoices can't come back, the jobs go back to deleted, each with its own time", async () => {
    env.respond = script({ invoiceUpdate: { error: { message: "boom" } } });
    const result = await restoreJobs([A, B]);
    expect(result).toEqual({ ok: false, error: "Couldn't restore those jobs. Check your signal and try again." });
    const putBack = writes().slice(2);
    expect(putBack).toEqual([
      expect.objectContaining({
        table: "quotes",
        values: { deleted_at: T },
        filters: [
          ["eq", "user_id", "owner-1"],
          ["in", "id", [A]],
          ["is", "deleted_at", null],
        ],
      }),
      expect.objectContaining({
        table: "quotes",
        values: { deleted_at: T2 },
        filters: [
          ["eq", "user_id", "owner-1"],
          ["in", "id", [B]],
          ["is", "deleted_at", null],
        ],
      }),
    ]);
    expect(env.captured.length).toBeGreaterThanOrEqual(1);
    expect(env.revalidated).toEqual([]);
  });

  it("a failed read says so and writes nothing", async () => {
    env.respond = () => ({ error: { message: "boom" } });
    const result = await restoreJobs([A]);
    expect(result.ok).toBe(false);
    expect(writes()).toHaveLength(0);
    expect(env.captured).toHaveLength(1);
  });

  it("refuses bad input and signed-out callers", async () => {
    await expect(restoreJobs(["nope"])).resolves.toMatchObject({ ok: false });
    expect(env.db).toBeNull();
    env.user = null;
    await expect(restoreJobs([A])).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
