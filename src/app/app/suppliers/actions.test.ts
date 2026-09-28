import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

// The supplier-browser save kept a price to the cent with a plain
// Math.round(n * 100) / 100, which rounds a half cent DOWN whenever the double
// sits a hair below it ($4.015 × 100 = 401.49999999999994 → $4.01). It now
// uses the app's one money rule, quote-defaults.round2 (exact half-up).
//
// It also now matches an existing item by name case-insensitively (trimmed,
// spaces collapsed) before writing: the DB's unique index on (user_id, name)
// is case-SENSITIVE, so a re-capture of "Pine 90x45" saved as "pine 90x45"
// used to create a near-duplicate row instead of updating the original.

const env = vi.hoisted(() => ({
  saved: [] as Array<{ id: string; name: string }>,
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
      if (op.action === "select") return { data: env.saved };
      return { data: { id: "mat-1" } };
    });
    env.ops = db.ops;
    return { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }, from: db.from };
  },
}));

import { saveSupplierMaterial } from "./actions";

const writes = (action: FakeOp["action"]) => env.ops.filter((o) => o.table === "materials" && o.action === action);

const save = (price: unknown, over: Partial<Parameters<typeof saveSupplierMaterial>[0]> = {}) =>
  saveSupplierMaterial({
    name: "Tek screws 12g",
    unit: "each",
    default_unit_price: price,
    supplier: "Bunnings",
    supplier_url: null,
    notes: null,
    ...over,
  });

describe("saveSupplierMaterial — price to the cent, exact half-up", () => {
  beforeEach(() => {
    env.saved = [];
    env.respond = null;
    env.ops = [];
  });

  it("$4.015 is saved as $4.02 (plain float rounding saved $4.01)", async () => {
    expect(await save(4.015)).toEqual({ ok: true, id: "mat-1" });
    expect(writes("insert")[0].values).toMatchObject({ default_unit_price: 4.02 });
  });

  it("a typed string price is rounded the same way", async () => {
    await save("8.075");
    expect(writes("insert")[0].values).toMatchObject({ default_unit_price: 8.08 });
  });

  it("still refuses a negative or non-numeric price", async () => {
    expect(await save(-1)).toEqual({ ok: false, error: "Price must be a non-negative number." });
    expect(await save("abc")).toEqual({ ok: false, error: "Price must be a non-negative number." });
    expect(writes("insert")).toEqual([]);
  });
});

describe("saveSupplierMaterial — case-insensitive name match", () => {
  beforeEach(() => {
    env.saved = [];
    env.respond = null;
    env.ops = [];
  });

  it("updates the existing item (any case/spacing) instead of inserting a near-duplicate", async () => {
    env.saved = [{ id: "m1", name: "Pine  90x45" }];
    const res = await save(4.5, { name: "pine 90x45" });
    expect(res).toEqual({ ok: true, id: "mat-1" });
    expect(writes("insert")).toEqual([]);
    expect(writes("update")).toHaveLength(1);
    expect(writes("update")[0].values).toMatchObject({ default_unit_price: 4.5 });
    // The saved name is kept, never overwritten with the newly captured casing.
    expect(writes("update")[0].values).not.toHaveProperty("name");
    expect(writes("update")[0].filters).toEqual(
      expect.arrayContaining([["eq", "id", "m1"], ["eq", "user_id", "user-1"]]),
    );
  });

  it("never wipes what this page didn't read (the tradie's notes)", async () => {
    env.saved = [{ id: "m1", name: "Pine 90x45" }];
    await save(4.5, { name: "pine 90x45" });
    expect(writes("update")[0].values).not.toHaveProperty("notes");
  });

  it("inserts a genuinely new name", async () => {
    env.saved = [{ id: "m1", name: "Something else entirely" }];
    await save(4.5, { name: "Tek screws 12g" });
    expect(writes("insert")).toHaveLength(1);
    expect(writes("update")).toEqual([]);
  });
});
