import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

// The quick-start price form kept each price to the cent with a plain
// Math.round(n * 100) / 100 ($4.015 → $4.01). It now uses the app's one money
// rule, quote-defaults.round2 (exact half-up).
//
// It also used to silently drop a starter item that was already in the
// tradie's library (an upsert with ignoreDuplicates), while still claiming
// every row was "added". It now checks case-insensitively (trimmed, spaces
// collapsed) first and reports the split honestly.

const env = vi.hoisted(() => ({
  existing: [] as Array<{ name: string }>,
  respond: null as null | ((op: FakeOp) => FakeResult),
  ops: [] as FakeOp[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      if (env.respond) {
        const r = env.respond(op);
        if (r) return r;
      }
      if (op.action === "select") return { data: env.existing };
      return { error: null };
    });
    env.ops = db.ops;
    return { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }, from: db.from };
  },
}));

import { STARTER_MATERIALS } from "./_data";
import { saveQuickStartMaterials } from "./actions";

const writes = (action: FakeOp["action"]) => env.ops.filter((o) => o.table === "materials" && o.action === action);
const rowsOf = (op: FakeOp) => (Array.isArray(op.values) ? op.values : [op.values]) as Array<Record<string, unknown>>;

beforeEach(() => {
  env.existing = [];
  env.respond = null;
  env.ops = [];
});

describe("saveQuickStartMaterials — prices to the cent, exact half-up", () => {
  it("$4.015 is saved as $4.02 and $8.075 as $8.08 (plain float rounding saved $4.01 / $8.07)", async () => {
    const [first, second] = STARTER_MATERIALS;
    const form = new FormData();
    form.set(`price_${first.slug}`, "4.015");
    form.set(`price_${second.slug}`, "8.075");
    await expect(saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form)).rejects.toThrow(
      "NEXT_REDIRECT /app/materials?started=2",
    );
    const price = (name: string) => rowsOf(writes("insert")[0]).find((r) => r.name === name)?.default_unit_price;
    expect(price(first.name)).toBe(4.02);
    expect(price(second.name)).toBe(8.08);
  });
});

describe("saveQuickStartMaterials — duplicates are reported, never silently added", () => {
  function form(entries: Array<[typeof STARTER_MATERIALS[number], string]>) {
    const f = new FormData();
    for (const [m, price] of entries) f.set(`price_${m.slug}`, price);
    return f;
  }

  it("a name already in the library (any case/spacing) is not re-added, and the redirect says so", async () => {
    const [first, second] = STARTER_MATERIALS;
    env.existing = [{ name: `  ${first.name.toUpperCase()}  ` }];
    await expect(
      saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form([[first, "10"], [second, "20"]])),
    ).rejects.toThrow("NEXT_REDIRECT /app/materials?started=1&already=1");
    // Only the genuinely new one is inserted.
    expect(rowsOf(writes("insert")[0])).toHaveLength(1);
    expect(rowsOf(writes("insert")[0])[0]).toMatchObject({ name: second.name });
  });

  it("every item already there: nothing is inserted, both counted honestly", async () => {
    const [first] = STARTER_MATERIALS;
    env.existing = [{ name: first.name }];
    await expect(
      saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form([[first, "10"]])),
    ).rejects.toThrow("NEXT_REDIRECT /app/materials?started=0&already=1");
    expect(writes("insert")).toEqual([]);
  });

  it("nothing already there: the redirect carries no &already= at all", async () => {
    const [first] = STARTER_MATERIALS;
    await expect(
      saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form([[first, "10"]])),
    ).rejects.toThrow("NEXT_REDIRECT /app/materials?started=1");
  });

  it("a read failure surfaces as an error instead of risking a duplicate write", async () => {
    const [first] = STARTER_MATERIALS;
    env.respond = (op) => (op.action === "select" ? { data: null, error: { message: "boom" } } : undefined);
    const result = await saveQuickStartMaterials({ ok: true, inserted: 0, skipped: 0 }, form([[first, "10"]]));
    expect(result).toEqual({ error: "Could not save your materials. Try again." });
    expect(writes("insert")).toEqual([]);
  });
});
