import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The public quote page's "Pay deposit" button must show what checkout
 * charges: a share of the accepted total (accepted_total), and nothing for
 * a deleted quote (/api/payments/checkout skips those).
 */

const h = vi.hoisted(() => ({
  quote: null as Record<string, unknown> | null,
  filters: [] as Array<[string, string, unknown]>,
  account: { stripe_account_id: "acct_1", charges_enabled: true, details_submitted: true, deposit_pct: 50 } as Record<string, unknown> | null,
  paid: null as { id: string } | null,
}));

vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/stripe-client", () => ({ stripeClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      const filters: Array<[string, string, unknown]> = [];
      const query: Record<string, unknown> = {
        select: () => query,
        eq: (c: string, v: unknown) => {
          filters.push(["eq", c, v]);
          return query;
        },
        is: (c: string, v: unknown) => {
          filters.push(["is", c, v]);
          return query;
        },
        maybeSingle: async () => {
          if (table === "quotes") {
            h.filters = filters;
            const deletedFilter = filters.some(([m, c, v]) => m === "is" && c === "deleted_at" && v === null);
            const quote = h.quote && (!deletedFilter || !h.quote.deleted_at) ? h.quote : null;
            return { data: quote, error: null };
          }
          if (table === "payment_accounts") return { data: h.account, error: null };
          return { data: h.paid, error: null };
        },
      };
      return query;
    },
  }),
}));

import { getQuoteDepositInfo } from "./payments";

beforeEach(() => {
  vi.stubEnv("PAYMENTS_ENABLED", "true");
  h.paid = null;
  h.quote = { id: "quote-1", user_id: "tradie-1", total_amount: 1200, accepted_total: 1000, currency: "NZD", deleted_at: null };
});
afterEach(() => vi.unstubAllEnvs());

describe("getQuoteDepositInfo", () => {
  it("is a share of the accepted total, the amount checkout charges", async () => {
    expect(await getQuoteDepositInfo("tok")).toEqual({ show: true, amountCents: 50000, currency: "NZD" });
  });

  it("falls back to the quote total before acceptance", async () => {
    h.quote = { ...h.quote, accepted_total: null };
    expect(await getQuoteDepositInfo("tok")).toMatchObject({ amountCents: 60000 });
  });

  it("nothing for a deleted quote", async () => {
    h.quote = { ...h.quote, deleted_at: "2026-09-20T00:00:00Z" };
    expect(await getQuoteDepositInfo("tok")).toBeNull();
    expect(h.filters).toContainEqual(["is", "deleted_at", null]);
  });

  it("no button once the deposit is paid", async () => {
    h.paid = { id: "pay-1" };
    expect(await getQuoteDepositInfo("tok")).toMatchObject({ show: false });
  });
});
