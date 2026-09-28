import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account deletion must stop billing before anything is destroyed.
 *
 * Audit 2026-09-28: the purge cancelled only the subscription id saved in
 * the database, swallowed every error (timeouts, rate limits, a bad key),
 * then deleted the customer record and the login — so Stripe could keep
 * charging a deleted account with no way left to cancel.
 */

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  stripe: null as unknown,
  row: null as Record<string, unknown> | null,
  readError: null as unknown,
  deletes: [] as string[],
  deleteUser: vi.fn(),
}));

vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/stripe-client", () => ({ tryStripe: () => h.stripe }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        delete: () => {
          h.deletes.push(table);
          return query;
        },
        maybeSingle: async () => ({ data: h.row, error: h.readError }),
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      };
      return query;
    },
    storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: async () => ({ error: null }) }) },
    auth: { admin: { deleteUser: h.deleteUser } },
  }),
}));

import {
  BILLING_STOP_FAILED,
  cancelLiveSubscriptions,
  isTransientStripeError,
  purgeAccount,
  stopBilling,
  type BillingStripe,
} from "./account-deletion";
import { adminClient } from "@/lib/supabase/admin";

type Sub = { id: string; status: string };

function stripeError(type: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(type), { type, ...extra });
}

function fakeStripe(subs: Sub[], opts: { pageSize?: number } = {}) {
  const state = new Map(subs.map((s) => [s.id, { ...s }]));
  const cancelFailures: Array<Error> = [];
  const listCalls: Array<Record<string, unknown>> = [];
  const expired: string[] = [];
  const stripe: BillingStripe & { cancelFailures: Error[]; listCalls: typeof listCalls; expired: string[]; cancelled: string[] } = {
    cancelFailures,
    listCalls,
    expired,
    cancelled: [],
    subscriptions: {
      list: async (params) => {
        listCalls.push(params);
        const all = [...state.values()];
        const start = params.starting_after ? all.findIndex((s) => s.id === params.starting_after) + 1 : 0;
        const size = opts.pageSize ?? 100;
        const data = all.slice(start, start + size).map((s) => ({ ...s }));
        return { data, has_more: start + size < all.length };
      },
      retrieve: async (id) => {
        const sub = state.get(id);
        if (!sub) throw stripeError("StripeInvalidRequestError", { code: "resource_missing", statusCode: 404 });
        return { ...sub };
      },
      cancel: async (id) => {
        const failure = cancelFailures.shift();
        if (failure) throw failure;
        const sub = state.get(id);
        if (!sub) throw stripeError("StripeInvalidRequestError", { code: "resource_missing", statusCode: 404 });
        sub.status = "canceled";
        stripe.cancelled.push(id);
        return { ...sub };
      },
    },
    checkout: {
      sessions: {
        list: async () => ({ data: [{ id: "cs_open" }] }),
        expire: async (id) => {
          expired.push(id);
          return {};
        },
      },
    },
  };
  return stripe;
}

const noSleep = vi.fn(async () => {});

beforeEach(() => {
  h.capture.mockReset();
  h.deleteUser.mockReset();
  h.deleteUser.mockResolvedValue({ error: null });
  noSleep.mockClear();
  h.row = null;
  h.readError = null;
  h.stripe = null;
  h.deletes = [];
});

describe("cancelLiveSubscriptions", () => {
  it("cancels every live subscription on the customer, not just the stored one", async () => {
    const stripe = fakeStripe([
      { id: "sub_active", status: "active" },
      { id: "sub_old", status: "canceled" },
      { id: "sub_unpaid", status: "unpaid" },
      { id: "sub_expired", status: "incomplete_expired" },
      { id: "sub_paused", status: "paused" },
    ]);
    const cancelled = await cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: "sub_old" }, noSleep);
    expect(cancelled.sort()).toEqual(["sub_active", "sub_paused", "sub_unpaid"]);
  });

  it("pages through a long subscription list", async () => {
    const subs = Array.from({ length: 5 }, (_, i) => ({ id: `sub_${i}`, status: "active" }));
    const stripe = fakeStripe(subs, { pageSize: 2 });
    expect(await cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: null }, noSleep)).toHaveLength(5);
    expect(stripe.listCalls.map((c) => c.starting_after)).toEqual([undefined, "sub_1", "sub_3"]);
  });

  it("still cancels a stored subscription when no customer id was saved", async () => {
    const stripe = fakeStripe([{ id: "sub_lonely", status: "past_due" }]);
    expect(await cancelLiveSubscriptions(stripe, { customerId: null, subscriptionId: "sub_lonely" }, noSleep)).toEqual(["sub_lonely"]);
  });

  it("a stored subscription Stripe no longer has is nothing to bill", async () => {
    const stripe = fakeStripe([]);
    expect(await cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: "sub_gone" }, noSleep)).toEqual([]);
  });

  it("a customer Stripe no longer has (deleted, or a test-mode id) has nothing to bill", async () => {
    const stripe = fakeStripe([]);
    stripe.subscriptions.list = async () => {
      throw stripeError("StripeInvalidRequestError", { code: "resource_missing", statusCode: 404 });
    };
    expect(await cancelLiveSubscriptions(stripe, { customerId: "cus_gone", subscriptionId: null }, noSleep)).toEqual([]);
  });

  it("retries timeouts and rate limits, backing off", async () => {
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    stripe.cancelFailures.push(
      stripeError("StripeConnectionError"),
      stripeError("StripeRateLimitError", { statusCode: 429 }),
    );
    expect(await cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: null }, noSleep)).toEqual(["sub_active"]);
    expect(noSleep.mock.calls).toEqual([[400], [1200]]);
  });

  it("gives up after three tries and says so", async () => {
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    stripe.cancelFailures.push(...Array.from({ length: 3 }, () => stripeError("StripeAPIError", { statusCode: 503 })));
    await expect(cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: null }, noSleep)).rejects.toThrow("StripeAPIError");
  });

  it("an error from a subscription that did get cancelled (a retried timeout) is fine", async () => {
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    const original = stripe.subscriptions.cancel;
    stripe.subscriptions.cancel = async (id) => {
      await original(id); // Stripe cancelled it...
      throw stripeError("StripeInvalidRequestError", { statusCode: 400 }); // ...but the answer was lost
    };
    await expect(cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: null }, noSleep)).resolves.toEqual(["sub_active"]);
  });

  it("does not retry errors that will not fix themselves", async () => {
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    stripe.cancelFailures.push(stripeError("StripeAuthenticationError", { statusCode: 401 }));
    await expect(cancelLiveSubscriptions(stripe, { customerId: "cus_1", subscriptionId: null }, noSleep)).rejects.toThrow();
    expect(noSleep).not.toHaveBeenCalled();
  });
});

describe("isTransientStripeError", () => {
  it("knows Stripe's temporary failures", () => {
    expect(isTransientStripeError(stripeError("StripeConnectionError"))).toBe(true);
    expect(isTransientStripeError(stripeError("StripeRateLimitError"))).toBe(true);
    expect(isTransientStripeError(stripeError("StripeAPIError", { statusCode: 500 }))).toBe(true);
    expect(isTransientStripeError({ statusCode: 409 })).toBe(true);
    expect(isTransientStripeError({ code: "lock_timeout" })).toBe(true);
  });
  it("leaves permanent ones alone", () => {
    expect(isTransientStripeError(stripeError("StripeInvalidRequestError", { statusCode: 400 }))).toBe(false);
    expect(isTransientStripeError(stripeError("StripeAuthenticationError", { statusCode: 401 }))).toBe(false);
    expect(isTransientStripeError(null)).toBe(false);
    expect(isTransientStripeError("boom")).toBe(false);
  });
});

describe("stopBilling", () => {
  const admin = () => adminClient() as unknown as Parameters<typeof stopBilling>[0];

  it("nothing stored: nothing to stop, no Stripe needed", async () => {
    expect(await stopBilling(admin(), "user-1", { stripe: null, sleep: noSleep })).toEqual({ ok: true });
  });

  it("cancels, then closes open checkout pages", async () => {
    h.row = { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_active" };
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    expect(await stopBilling(admin(), "user-1", { stripe, sleep: noSleep })).toEqual({ ok: true });
    expect(stripe.cancelled).toEqual(["sub_active"]);
    expect(stripe.expired).toEqual(["cs_open"]);
  });

  it("a failed read stops the deletion", async () => {
    h.readError = { message: "offline" };
    expect(await stopBilling(admin(), "user-1", { stripe: fakeStripe([]), sleep: noSleep })).toEqual({ ok: false, error: BILLING_STOP_FAILED });
  });

  it("stored Stripe ids without a Stripe key stop the deletion", async () => {
    h.row = { stripe_customer_id: "cus_1", stripe_subscription_id: null };
    expect(await stopBilling(admin(), "user-1", { stripe: null, sleep: noSleep })).toEqual({ ok: false, error: BILLING_STOP_FAILED });
    expect(h.capture).toHaveBeenCalled();
  });

  it("a cancel that keeps failing stops the deletion and is reported", async () => {
    h.row = { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_active" };
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    stripe.cancelFailures.push(...Array.from({ length: 3 }, () => stripeError("StripeConnectionError")));
    expect(await stopBilling(admin(), "user-1", { stripe, sleep: noSleep })).toEqual({ ok: false, error: BILLING_STOP_FAILED });
    expect(h.capture).toHaveBeenCalledTimes(1);
  });

  it("the message never mentions plans or payments (the iPhone app shows it too)", () => {
    expect(BILLING_STOP_FAILED).not.toMatch(/plan|subscri|pay|bill|stripe/i);
    expect(BILLING_STOP_FAILED).toMatch(/nothing was deleted/);
  });
});

describe("purgeAccount", () => {
  it("deletes nothing (and keeps the login) when billing cannot be stopped", async () => {
    h.row = { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_active" };
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }]);
    stripe.cancelFailures.push(stripeError("StripeAuthenticationError", { statusCode: 401 }));
    h.stripe = stripe;
    expect(await purgeAccount("user-1")).toEqual({ ok: false, error: BILLING_STOP_FAILED });
    expect(h.deletes).toEqual([]);
    expect(h.deleteUser).not.toHaveBeenCalled();
  });

  it("goes ahead once every subscription is cancelled", async () => {
    h.row = { stripe_customer_id: "cus_1", stripe_subscription_id: "sub_active" };
    const stripe = fakeStripe([{ id: "sub_active", status: "active" }, { id: "sub_second", status: "trialing" }]);
    h.stripe = stripe;
    expect(await purgeAccount("user-1")).toEqual({ ok: true });
    expect(stripe.cancelled.sort()).toEqual(["sub_active", "sub_second"]);
    expect(h.deletes).toContain("subscriptions");
    expect(h.deleteUser).toHaveBeenCalledWith("user-1");
  });
});
