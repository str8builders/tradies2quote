import { beforeEach, describe, expect, it, vi } from "vitest";

// The deposit Save must not say "Saved" when nothing was saved (audit 2026-09-28).

const h = vi.hoisted(() => ({ set: vi.fn(), revalidate: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }),
}));
vi.mock("@/lib/payments", () => ({ paymentsEnabled: () => true, setDepositPct: h.set }));

import { saveDepositPctAction } from "./payments-actions";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveDepositPctAction", () => {
  it("ok only when the deposit was saved", async () => {
    h.set.mockResolvedValue({ ok: true });
    expect(await saveDepositPctAction(35)).toEqual({ ok: true });
    expect(h.set).toHaveBeenCalledWith("user-1", 35);
  });

  it("passes on the reason nothing was saved", async () => {
    h.set.mockResolvedValue({ ok: false, error: "Couldn't save the deposit. Try again." });
    expect(await saveDepositPctAction(35)).toEqual({ ok: false, error: "Couldn't save the deposit. Try again." });
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("a thrown error is a plain message, not a crash", async () => {
    h.set.mockRejectedValue(new Error("fetch failed"));
    expect(await saveDepositPctAction(35)).toMatchObject({ ok: false });
  });
});
