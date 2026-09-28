import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isMissingEndpointColumn,
  ledgerForgetEvent,
  ledgerHasEvent,
  ledgerRecordEvent,
  legacyLedgerKey,
} from "./stripe-webhook-ledger";

type Row = { endpoint?: string; event_id: string };

/** An in-memory stripe_webhook_events, with or without the endpoint column. */
function fakeDb(opts: { hasEndpointColumn: boolean; rows?: Row[] }) {
  const rows: Row[] = [...(opts.rows ?? [])];
  const missing = (op: string) =>
    op === "insert"
      ? { code: "PGRST204", message: "Could not find the 'endpoint' column of 'stripe_webhook_events' in the schema cache" }
      : { code: "42703", message: "column stripe_webhook_events.endpoint does not exist" };
  const db = {
    from: () => {
      let op = "select";
      let values: Record<string, unknown> = {};
      const eq: Record<string, unknown> = {};
      const keyOf = (r: { endpoint?: unknown; event_id?: unknown }) =>
        `${opts.hasEndpointColumn ? String(r.endpoint ?? "subscriptions") : ""}|${String(r.event_id)}`;
      const run = () => {
        const usesEndpoint = "endpoint" in values || "endpoint" in eq;
        if (!opts.hasEndpointColumn && usesEndpoint) return { data: null, error: missing(op) };
        if (op === "insert") {
          if (rows.some((r) => keyOf(r) === keyOf(values))) return { data: null, error: { code: "23505", message: "duplicate key value" } };
          rows.push(values as Row);
          return { data: null, error: null };
        }
        const match = (r: Row) => (eq.endpoint === undefined || (r.endpoint ?? "subscriptions") === eq.endpoint) && r.event_id === eq.event_id;
        if (op === "delete") {
          for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
          return { data: null, error: null };
        }
        const found = rows.find(match);
        return { data: found ? { event_id: found.event_id } : null, error: null };
      };
      const query: Record<string, unknown> = {
        select: () => query,
        insert: (v: Record<string, unknown>) => { op = "insert"; values = v; return query; },
        delete: () => { op = "delete"; return query; },
        eq: (c: string, v: unknown) => { eq[c] = v; return query; },
        maybeSingle: async () => run(),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) => Promise.resolve(run()).then(res, rej),
      };
      return query;
    },
  };
  return { db: db as unknown as Parameters<typeof ledgerHasEvent>[0], rows };
}

describe("the Stripe webhook ledger is per endpoint", () => {
  it("the same event is recorded once for each endpoint", async () => {
    const { db, rows } = fakeDb({ hasEndpointColumn: true });
    expect(await ledgerRecordEvent(db, "subscriptions", "evt_1", "checkout.session.completed")).toEqual({ ok: true, duplicate: false });
    expect(await ledgerRecordEvent(db, "payments", "evt_1", "checkout.session.completed")).toEqual({ ok: true, duplicate: false });
    expect(await ledgerRecordEvent(db, "payments", "evt_1", "checkout.session.completed")).toEqual({ ok: true, duplicate: true });
    expect(rows).toHaveLength(2);
    expect(await ledgerHasEvent(db, "payments", "evt_1")).toEqual({ ok: true, done: true });
    expect(await ledgerHasEvent(db, "subscriptions", "evt_2")).toEqual({ ok: true, done: false });
  });

  it("forgetting one endpoint's record leaves the other's", async () => {
    const { db } = fakeDb({ hasEndpointColumn: true, rows: [{ endpoint: "subscriptions", event_id: "evt_1" }, { endpoint: "payments", event_id: "evt_1" }] });
    expect(await ledgerForgetEvent(db, "payments", "evt_1")).toEqual({ error: null });
    expect(await ledgerHasEvent(db, "payments", "evt_1")).toEqual({ ok: true, done: false });
    expect(await ledgerHasEvent(db, "subscriptions", "evt_1")).toEqual({ ok: true, done: true });
  });

  it("before the migration: plain ids for subscriptions, prefixed ids for deposits", async () => {
    const { db, rows } = fakeDb({ hasEndpointColumn: false, rows: [{ event_id: "evt_1" }] });
    expect(await ledgerHasEvent(db, "subscriptions", "evt_1")).toEqual({ ok: true, done: true });
    expect(await ledgerHasEvent(db, "payments", "evt_1")).toEqual({ ok: true, done: false });
    expect(await ledgerRecordEvent(db, "payments", "evt_1", "checkout.session.completed")).toEqual({ ok: true, duplicate: false });
    expect(rows.map((r) => r.event_id)).toEqual(["evt_1", "payments:evt_1"]);
    expect(await ledgerRecordEvent(db, "payments", "evt_1", "checkout.session.completed")).toEqual({ ok: true, duplicate: true });
    await ledgerForgetEvent(db, "payments", "evt_1");
    expect(rows.map((r) => r.event_id)).toEqual(["evt_1"]);
  });

  it("only a missing endpoint column triggers the fallback", () => {
    expect(isMissingEndpointColumn({ code: "42703", message: "column stripe_webhook_events.endpoint does not exist" })).toBe(true);
    expect(isMissingEndpointColumn({ code: "PGRST204", message: "Could not find the 'endpoint' column" })).toBe(true);
    expect(isMissingEndpointColumn({ code: "42703", message: "column stripe_webhook_events.other does not exist" })).toBe(false);
    expect(isMissingEndpointColumn({ code: "08006", message: "endpoint unreachable" })).toBe(false);
    expect(isMissingEndpointColumn(null)).toBe(false);
  });

  it("other database errors are returned, not guessed at", async () => {
    const db = {
      from: () => {
        const query: Record<string, unknown> = {
          select: () => query,
          insert: () => query,
          eq: () => query,
          maybeSingle: async () => ({ data: null, error: { code: "08006", message: "connection lost" } }),
          then: (res: (v: unknown) => void) => res({ data: null, error: { code: "08006", message: "connection lost" } }),
        };
        return query;
      },
    } as unknown as Parameters<typeof ledgerHasEvent>[0];
    expect(await ledgerHasEvent(db, "subscriptions", "evt_1")).toMatchObject({ ok: false });
    expect(await ledgerRecordEvent(db, "payments", "evt_1", "x")).toMatchObject({ ok: false });
  });

  it("legacy keys", () => {
    expect(legacyLedgerKey("subscriptions", "evt_9")).toBe("evt_9");
    expect(legacyLedgerKey("payments", "evt_9")).toBe("payments:evt_9");
  });
});

describe("20260929_stripe_webhook_ledger_endpoint.sql", () => {
  const sql = readFileSync(
    resolve(__dirname, "../../supabase/migrations/20260929_stripe_webhook_ledger_endpoint.sql"),
    "utf8",
  );

  it("is additive: no rows or tables are deleted", () => {
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
  });

  it("is guarded for re-runs and keeps the old app build working", () => {
    expect(sql).toMatch(/add column if not exists endpoint/i);
    expect(sql).toMatch(/set default 'subscriptions'/i);
    expect(sql).toMatch(/like 'payments:%'/i);
    expect(sql).toMatch(/\(endpoint, event_id\)/);
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
  });
});
