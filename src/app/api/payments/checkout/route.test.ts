import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { fakeSupabase, type FakeOp } from "@/test/fake-supabase";

/**
 * Deposit checkout from the client's quote link (audit 2026-09-28): a deleted
 * job takes no payment, and the deposit is a share of the total the client
 * accepted, not whatever the total says now.
 */
const state = vi.hoisted(() => ({ admin: null as unknown, create: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => state.admin }));
vi.mock("@/lib/stripe-client", () => ({
  stripeClient: () => ({ checkout: { sessions: { create: state.create, expire: vi.fn() } } }),
}));
vi.mock("@/lib/payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/payments")>()),
  paymentsEnabled: () => true,
  platformFeeBps: () => 0,
  getConnectStatus: async () => ({
    connected: true, chargesEnabled: true, detailsSubmitted: true, depositPct: 50, stripeAccountId: "acct_1",
  }),
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  consumeFixedWindow: () => ({ ok: true }),
  tooManyRequestsResponse: () => new Response(null, { status: 429 }),
}));

import { POST } from "./route";

let quote: Record<string, unknown> | null;
let db: ReturnType<typeof fakeSupabase>;

beforeEach(() => {
  quote = { id: "quote-1", user_id: "owner-1", status: "accepted", total_amount: 1500, accepted_total: 1000, currency: "NZD" };
  db = fakeSupabase((op: FakeOp) => {
    if (op.table === "quotes") {
      // Mirror the real filter: a deleted job never comes back.
      const liveOnly = op.filters.some(([method, column, value]) => method === "is" && column === "deleted_at" && value === null);
      return { data: liveOnly && quote && !quote.deleted_at ? quote : null };
    }
    if (op.table === "payments" && op.action === "insert") return { data: { id: "pay-1" } };
    return {};
  });
  state.admin = { from: db.from };
  state.create.mockReset().mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.test/cs_1" });
});

const checkout = () =>
  POST(
    new NextRequest("https://tradies2quote.com/api/payments/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok-1" }),
    }),
  );

describe("deposit checkout", () => {
  it("charges the deposit on the accepted total", async () => {
    const res = await checkout();
    expect(res.status).toBe(200);
    // 50% of the $1,000 the client accepted — not of today's $1,500.
    const payment = db.ops.find((op) => op.table === "payments" && op.action === "insert");
    expect(payment?.values).toMatchObject({ amount_cents: 50000 });
    expect(state.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(50000);
  });

  it("falls back to the total for a quote accepted before the accepted total was recorded", async () => {
    quote!.accepted_total = null;
    await checkout();
    const payment = db.ops.find((op) => op.table === "payments" && op.action === "insert");
    expect(payment?.values).toMatchObject({ amount_cents: 75000 });
  });

  it("takes no payment for a deleted job", async () => {
    quote!.deleted_at = "2026-09-20T00:00:00Z";
    const res = await checkout();
    expect(res.status).toBe(404);
    expect(state.create).not.toHaveBeenCalled();
    expect(db.ops.some((op) => op.table === "payments")).toBe(false);
  });
});
