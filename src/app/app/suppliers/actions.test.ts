import { beforeEach, describe, expect, it, vi } from "vitest";

// The supplier-browser save kept a price to the cent with a plain
// Math.round(n * 100) / 100, which rounds a half cent DOWN whenever the double
// sits a hair below it ($4.015 × 100 = 401.49999999999994 → $4.01). It now
// uses the app's one money rule, quote-defaults.round2 (exact half-up).

const db = vi.hoisted(() => ({ inserted: [] as Array<Record<string, unknown>> }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        db.inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "mat-1" }, error: null }) }) };
      },
    }),
  }),
}));

import { saveSupplierMaterial } from "./actions";

const save = (price: unknown) =>
  saveSupplierMaterial({
    name: "Tek screws 12g",
    unit: "each",
    default_unit_price: price,
    supplier: "Bunnings",
    supplier_url: null,
    notes: null,
  });

describe("saveSupplierMaterial — price to the cent, exact half-up", () => {
  beforeEach(() => {
    db.inserted = [];
  });

  it("$4.015 is saved as $4.02 (plain float rounding saved $4.01)", async () => {
    expect(await save(4.015)).toEqual({ ok: true, id: "mat-1" });
    expect(db.inserted[0].default_unit_price).toBe(4.02);
  });

  it("a typed string price is rounded the same way", async () => {
    await save("8.075");
    expect(db.inserted[0].default_unit_price).toBe(8.08);
  });

  it("still refuses a negative or non-numeric price", async () => {
    expect(await save(-1)).toEqual({ ok: false, error: "Price must be a non-negative number." });
    expect(await save("abc")).toEqual({ ok: false, error: "Price must be a non-negative number." });
    expect(db.inserted).toEqual([]);
  });
});
