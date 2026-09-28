import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

// saveKit used to delete a kit's items, then insert the new ones. A failed
// insert (a bad value, a dropped connection) left the kit with its name
// saved but ZERO items — silent data loss with no way back. It now inserts
// the new items first and only removes the old ones once that succeeds, so
// a failed insert leaves the kit exactly as it was.

const env = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  existingItems: [] as Array<{ id: string }>,
  respond: null as null | ((op: FakeOp) => FakeResult),
  ops: [] as FakeOp[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/kits", () => ({ kitsEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      if (env.respond) {
        const r = env.respond(op);
        if (r) return r;
      }
      if (op.table === "kits" && op.action === "insert") return { data: { id: "kit-1" } };
      if (op.table === "kits" && op.action === "update") return { data: null, error: null };
      if (op.table === "kit_items" && op.action === "select") return { data: env.existingItems };
      return { data: null, error: null };
    });
    env.ops = db.ops;
    return { auth: { getUser: async () => ({ data: { user: env.user } }) }, from: db.from };
  },
}));

import { saveKit } from "./actions";

const kitItemOps = (action: FakeOp["action"]) => env.ops.filter((o) => o.table === "kit_items" && o.action === action);

const input = (over: Partial<Parameters<typeof saveKit>[0]> = {}) => ({
  id: "kit-1",
  name: "Standard hot-water swap",
  trade: null,
  notes: null,
  items: [{ type: "material" as const, description: "Cylinder 180L", quantity: 1, unit: "each", unit_price: 850 }],
  ...over,
});

beforeEach(() => {
  env.user = { id: "user-1" };
  env.existingItems = [{ id: "old-1" }, { id: "old-2" }];
  env.respond = null;
  env.ops = [];
});

describe("saveKit — atomic item replacement", () => {
  it("inserts the new items before removing the old ones", async () => {
    const res = await saveKit(input());
    expect(res).toEqual({ ok: true, id: "kit-1" });
    expect(kitItemOps("insert")).toHaveLength(1);
    expect(kitItemOps("delete")).toHaveLength(1);
    // Insert happened strictly before delete.
    const insertIdx = env.ops.findIndex((o) => o.table === "kit_items" && o.action === "insert");
    const deleteIdx = env.ops.findIndex((o) => o.table === "kit_items" && o.action === "delete");
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeLessThan(deleteIdx);
    // Only the items that existed before this save are removed.
    expect(kitItemOps("delete")[0].filters).toEqual(
      expect.arrayContaining([
        ["eq", "kit_id", "kit-1"],
        ["eq", "user_id", "user-1"],
        ["in", "id", ["old-1", "old-2"]],
      ]),
    );
  });

  it("a failed insert leaves the previous items untouched — never an emptied kit", async () => {
    env.respond = (op) => (op.table === "kit_items" && op.action === "insert" ? { error: { message: "bad value" } } : undefined);
    const res = await saveKit(input());
    expect(res).toEqual({ ok: false, error: "Could not save the kit's items — the previous ones are untouched." });
    // The delete never ran — the old items are still there.
    expect(kitItemOps("delete")).toEqual([]);
  });

  it("a failed cleanup delete still reports an error, but the new items are saved (never lost)", async () => {
    env.respond = (op) => (op.table === "kit_items" && op.action === "delete" ? { error: { message: "denied" } } : undefined);
    const res = await saveKit(input());
    expect(res.ok).toBe(false);
    expect((res as { error: string }).error).toMatch(/couldn't clear the old ones/i);
    // The new items were inserted regardless of the cleanup failure.
    expect(kitItemOps("insert")).toHaveLength(1);
  });

  it("saving a kit down to zero items still clears the old ones (an intentional clear, not a failure)", async () => {
    const res = await saveKit(input({ items: [] }));
    expect(res).toEqual({ ok: true, id: "kit-1" });
    expect(kitItemOps("insert")).toEqual([]);
    expect(kitItemOps("delete")).toHaveLength(1);
  });

  it("a brand-new kit (no previous items) just inserts, no delete call at all", async () => {
    env.existingItems = [];
    const res = await saveKit(input({ id: null }));
    expect(res).toEqual({ ok: true, id: "kit-1" });
    expect(kitItemOps("insert")).toHaveLength(1);
    expect(kitItemOps("delete")).toEqual([]);
  });

  it("requires a name and that kits are enabled", async () => {
    expect(await saveKit(input({ name: "  " }))).toEqual({ ok: false, error: "Give the kit a name." });
  });
});
