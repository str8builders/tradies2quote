import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Card payments (Stripe Connect) setup, audit 2026-09-28: UK tradies
 * couldn't connect (the app sent "UK"; Stripe needs "GB"), and a deposit
 * that failed to save still showed "Saved".
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
  capture: vi.fn(),
  existing: null as { stripe_account_id: string } | null,
  readError: null as unknown,
  saveError: null as unknown,
  updated: [] as unknown[],
  updateError: null as unknown,
  upserts: [] as unknown[],
}));

vi.mock("@/lib/observability", () => ({ captureError: h.capture }));
vi.mock("@/lib/stripe-client", () => ({ stripeClient: () => ({ accounts: { create: h.create } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => ({
    from: () => {
      let op = "select";
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        update: () => {
          op = "update";
          return query;
        },
        upsert: async (row: unknown) => {
          h.upserts.push(row);
          return { error: h.saveError };
        },
        maybeSingle: async () => ({ data: h.existing, error: h.readError }),
        then: (resolve: (v: unknown) => void) =>
          resolve(op === "update" ? { data: h.updated, error: h.updateError } : { data: null, error: null }),
      };
      return query;
    },
  }),
}));

import { ensureConnectedAccount, setDepositPct, stripeCountry } from "./payments";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(h, { existing: null, readError: null, saveError: null, updated: [{ user_id: "user-1" }], updateError: null, upserts: [] });
  h.create.mockResolvedValue({ id: "acct_1" });
});

describe("stripeCountry", () => {
  it("sends the United Kingdom as GB, which is what Stripe accepts", () => {
    expect(stripeCountry("UK")).toBe("GB");
    expect(stripeCountry("uk")).toBe("GB");
    expect(stripeCountry("GB")).toBe("GB");
  });
  it("passes other codes through and falls back to NZ", () => {
    expect(stripeCountry("au")).toBe("AU");
    expect(stripeCountry("US")).toBe("US");
    expect(stripeCountry(null)).toBe("NZ");
    expect(stripeCountry("")).toBe("NZ");
    expect(stripeCountry("United Kingdom")).toBe("NZ");
  });
});

describe("ensureConnectedAccount", () => {
  it("a UK tradie's account is created in GB", async () => {
    expect(await ensureConnectedAccount("user-1", "a@b.example", "UK")).toBe("acct_1");
    expect(h.create).toHaveBeenCalledWith(
      expect.objectContaining({ country: "GB" }),
      { idempotencyKey: "t2q-connect-account-user-1-GB" },
    );
    expect(h.upserts).toEqual([{ user_id: "user-1", stripe_account_id: "acct_1" }]);
  });

  it("reuses the saved account", async () => {
    h.existing = { stripe_account_id: "acct_saved" };
    expect(await ensureConnectedAccount("user-1", null, "NZ")).toBe("acct_saved");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("a failed read or save is an error, never a second account", async () => {
    h.readError = { message: "offline" };
    await expect(ensureConnectedAccount("user-1", null, "NZ")).rejects.toMatchObject({ message: "offline" });
    expect(h.create).not.toHaveBeenCalled();
    h.readError = null;
    h.saveError = { message: "offline" };
    await expect(ensureConnectedAccount("user-1", null, "NZ")).rejects.toMatchObject({ message: "offline" });
  });
});

describe("setDepositPct", () => {
  it("saved", async () => {
    expect(await setDepositPct("user-1", 30)).toEqual({ ok: true });
  });
  it("a failed write says so (and is reported)", async () => {
    h.updateError = { message: "timeout" };
    expect(await setDepositPct("user-1", 30)).toMatchObject({ ok: false });
    expect(h.capture).toHaveBeenCalled();
  });
  it("no card-payments account: nothing was saved, and it says so", async () => {
    h.updated = [];
    expect(await setDepositPct("user-1", 30)).toEqual({ ok: false, error: "Turn on card payments before setting a deposit." });
  });
});
