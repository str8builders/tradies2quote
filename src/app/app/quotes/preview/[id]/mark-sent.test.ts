// markInvoiceSentByHand: the tradie sent the invoice themselves. The same
// bookkeeping as the email send (status, sent_at, payment term restarted on a
// first send, an invoice_sent event), without the PDF or the email.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

const env = vi.hoisted(() => ({
  user: null as { id: string } | null,
  respond: (() => undefined) as (op: FakeOp) => FakeResult,
  db: null as ReturnType<typeof fakeSupabase> | null,
  admin: null as ReturnType<typeof fakeSupabase> | null,
  revalidated: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => void env.revalidated.push(path),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/observability", () => ({ captureError: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    env.db = fakeSupabase((op) => env.respond(op));
    return { auth: { getUser: async () => ({ data: { user: env.user } }) }, from: env.db.from };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => {
    env.admin = fakeSupabase(() => undefined);
    return { from: env.admin.from };
  },
}));

import { markInvoiceSentByHand } from "./actions";

const INVOICE = "00000000-0000-4000-8000-000000000001";
const QUOTE = "00000000-0000-4000-8000-000000000002";
const DRAFT = {
  id: INVOICE,
  quote_id: QUOTE,
  invoice_number: "INV-0007",
  status: "draft",
  // Raised two weeks ago with the default 7-day term.
  created_at: "2026-09-13T00:00:00.000Z",
  due_date: "2026-09-20T00:00:00.000Z",
  sent_at: null,
};

const ops = () => env.db!.ops;
const filter = (op: FakeOp, method: string, column: string) =>
  op.filters.find(([m, c]) => m === method && c === column)?.[2];

beforeEach(() => {
  env.user = { id: "owner-1" };
  env.db = null;
  env.admin = null;
  env.revalidated = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("markInvoiceSentByHand", () => {
  it("flips a draft to sent, restarts the payment term from today, and records the send", async () => {
    env.respond = (op) =>
      op.action === "select" ? { data: DRAFT } : op.action === "update" ? { data: { id: INVOICE, quote_id: QUOTE } } : undefined;
    const before = Date.now();
    const result = await markInvoiceSentByHand(INVOICE);
    expect("ok" in result && result.ok).toBe(true);

    const update = ops().find((op) => op.action === "update")!;
    expect(update.table).toBe("invoices");
    const values = update.values as { status: string; sent_at: string; due_date: string };
    expect(values.status).toBe("sent");
    expect(Date.parse(values.sent_at)).toBeGreaterThanOrEqual(before);
    // A 7-day term from the send, not the week-old draft's date.
    expect(Date.parse(values.due_date) - Date.parse(values.sent_at)).toBe(7 * 24 * 60 * 60 * 1000);
    // Only this user's live draft flips.
    expect(filter(update, "eq", "user_id")).toBe("owner-1");
    expect(filter(update, "eq", "status")).toBe("draft");
    expect(filter(update, "is", "deleted_at")).toBeNull();

    const event = env.admin!.ops.find((op) => op.action === "insert")!;
    expect(event.table).toBe("quote_events");
    expect(event.values).toMatchObject({ quote_id: QUOTE, type: "invoice_sent", metadata: { by_hand: true, invoice_id: INVOICE } });
    expect(env.revalidated).toContain(`/app/quotes/preview/${QUOTE}`);
  });

  it("an invoice already sent is left as it is: no write, the dates kept", async () => {
    const sent = { ...DRAFT, status: "sent", sent_at: "2026-09-20T01:00:00.000Z", due_date: "2026-09-27T01:00:00.000Z" };
    env.respond = (op) => (op.action === "select" ? { data: sent } : undefined);
    const result = await markInvoiceSentByHand(INVOICE);
    expect(result).toEqual({ ok: true, invoice_id: INVOICE, sent_at: sent.sent_at, due_date: sent.due_date });
    expect(ops().filter((op) => op.action !== "select")).toEqual([]);
    expect(env.admin).toBeNull();
  });

  it("someone else's, deleted or cancelled invoice: not found, nothing written", async () => {
    env.respond = () => ({ data: null });
    expect(await markInvoiceSentByHand(INVOICE)).toEqual({ error: "Invoice not found, or it's cancelled." });
    env.respond = (op) => (op.action === "select" ? { data: { ...DRAFT, status: "cancelled" } } : undefined);
    expect(await markInvoiceSentByHand(INVOICE)).toEqual({ error: "Invoice not found, or it's cancelled." });
    expect(ops().filter((op) => op.action !== "select")).toEqual([]);
  });

  it("signed out: sent to log in", async () => {
    env.user = null;
    await expect(markInvoiceSentByHand(INVOICE)).rejects.toThrow("NEXT_REDIRECT /login");
  });
});
