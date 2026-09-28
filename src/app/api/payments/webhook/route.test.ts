import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Deposits webhook. Stripe sends checkout.session.completed to BOTH webhook
 * endpoints; the processed-events ledger was keyed on the event id alone, so
 * whichever endpoint recorded it first made the other skip it: the deposit
 * stayed pending and the quote's other payment links stayed payable.
 */

const h = vi.hoisted(() => ({
  construct: vi.fn(),
  expire: vi.fn(),
  capture: vi.fn(),
  legacy: false,
  ledger: new Set<string>(),
  payments: [] as Array<{ id: string; quote_id: string; status: string; stripe_checkout_session_id: string | null }>,
  paymentWriteError: null as unknown,
  ledgerDeletes: [] as string[],
}));

vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/stripe-client", () => ({
  stripeClient: () => ({ webhooks: { constructEvent: h.construct }, checkout: { sessions: { expire: h.expire } } }),
}));

const missingColumn = (op: string) =>
  op === "insert"
    ? { code: "PGRST204", message: "Could not find the 'endpoint' column of 'stripe_webhook_events' in the schema cache" }
    : { code: "42703", message: "column stripe_webhook_events.endpoint does not exist" };

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      let op = "select";
      let values: Record<string, unknown> = {};
      const eq: Record<string, unknown> = {};
      const neq: Record<string, unknown> = {};
      const run = () => {
        if (table === "stripe_webhook_events") {
          const usesEndpoint = "endpoint" in values || "endpoint" in eq;
          if (h.legacy && usesEndpoint) return { data: null, error: missingColumn(op) };
          if (op === "insert") {
            const key = `${String(values.endpoint ?? "subscriptions")}|${String(values.event_id)}`;
            if (h.ledger.has(key)) return { data: null, error: { code: "23505", message: "duplicate key" } };
            h.ledger.add(key);
            return { data: null, error: null };
          }
          if (op === "delete") {
            const key = `${String(eq.endpoint ?? "subscriptions")}|${String(eq.event_id)}`;
            h.ledgerDeletes.push(key);
            h.ledger.delete(key);
            return { data: null, error: null };
          }
        }
        if (table === "payments") {
          if (op === "update") {
            if (h.paymentWriteError && values.status === "paid") return { data: null, error: h.paymentWriteError };
            for (const p of h.payments) {
              if (p.id === eq.id && (eq.status === undefined || p.status === eq.status) && p.status !== neq.status) {
                p.status = String(values.status);
              }
            }
            return { data: null, error: null };
          }
          const rows = h.payments.filter((p) => p.quote_id === eq.quote_id && p.id !== neq.id);
          return { data: rows.map((p) => ({ ...p })), error: null };
        }
        return { data: null, error: null };
      };
      const query: Record<string, unknown> = {
        select: () => query,
        insert: (v: Record<string, unknown>) => { op = "insert"; values = v; return query; },
        update: (v: Record<string, unknown>) => { op = "update"; values = v; return query; },
        delete: () => { op = "delete"; return query; },
        eq: (column: string, value: unknown) => { eq[column] = value; return query; },
        neq: (column: string, value: unknown) => { neq[column] = value; return query; },
        maybeSingle: async () => run(),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  }),
}));

import { POST } from "./route";

const request = () =>
  new NextRequest("https://tradies2quote.com/api/payments/webhook", {
    method: "POST",
    headers: { "stripe-signature": "signed" },
    body: "{}",
  });

const completed = {
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { mode: "payment", payment_status: "paid", payment_intent: "pi_1", metadata: { payment_id: "pay_1", quote_id: "quote_1" } } },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET = "test-only";
  h.legacy = false;
  h.paymentWriteError = null;
  h.ledgerDeletes = [];
  h.ledger = new Set();
  h.payments = [
    { id: "pay_1", quote_id: "quote_1", status: "pending", stripe_checkout_session_id: "cs_1" },
    { id: "pay_2", quote_id: "quote_1", status: "pending", stripe_checkout_session_id: "cs_2" },
  ];
  h.construct.mockReturnValue(completed);
  h.expire.mockResolvedValue({});
});

describe("deposits webhook ledger", () => {
  it("still takes the deposit when the subscriptions webhook recorded the same event first", async () => {
    h.ledger.add("subscriptions|evt_1");
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).not.toHaveProperty("duplicate");
    expect(h.payments.find((p) => p.id === "pay_1")?.status).toBe("paid");
    // The quote's other open payment link is closed.
    expect(h.expire).toHaveBeenCalledWith("cs_2");
    expect(h.payments.find((p) => p.id === "pay_2")?.status).toBe("expired");
    expect(h.ledger.has("payments|evt_1")).toBe(true);
  });

  it("a second delivery to this endpoint is a duplicate", async () => {
    h.ledger.add("payments|evt_1");
    expect(await (await POST(request())).json()).toMatchObject({ duplicate: true });
    expect(h.payments.find((p) => p.id === "pay_1")?.status).toBe("pending");
  });

  it("works before the ledger migration too, without colliding with the subscriptions row", async () => {
    h.legacy = true;
    h.ledger.add("subscriptions|evt_1"); // the old shape: a plain event id
    expect((await POST(request())).status).toBe(200);
    expect(h.payments.find((p) => p.id === "pay_1")?.status).toBe("paid");
    expect(h.ledger.has("subscriptions|payments:evt_1")).toBe(true);
  });

  it("a failed deposit write is retried, and only this endpoint's record is released", async () => {
    h.ledger.add("subscriptions|evt_1");
    h.paymentWriteError = { code: "08006", message: "connection lost" };
    expect((await POST(request())).status).toBe(500);
    expect(h.ledgerDeletes).toEqual(["payments|evt_1"]);
    expect(h.ledger.has("subscriptions|evt_1")).toBe(true);
    expect(h.capture).toHaveBeenCalled();
    // Stripe's retry then succeeds.
    h.paymentWriteError = null;
    expect((await POST(request())).status).toBe(200);
    expect(h.payments.find((p) => p.id === "pay_1")?.status).toBe("paid");
  });

  it("before the migration, a failure releases the prefixed row, never the subscriptions one", async () => {
    h.legacy = true;
    h.ledger.add("subscriptions|evt_1");
    h.paymentWriteError = { code: "08006", message: "connection lost" };
    expect((await POST(request())).status).toBe(500);
    expect(h.ledgerDeletes).toEqual(["subscriptions|payments:evt_1"]);
    expect(h.ledger.has("subscriptions|evt_1")).toBe(true);
  });
});
