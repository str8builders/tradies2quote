import { beforeEach, describe, expect, it, vi } from "vitest";

// Records every write the library actions make so we can assert that an
// update only touches the fields the import actually carried.
const db = vi.hoisted(() => ({
  existing: [] as Array<{ id: string; name: string }>,
  taxRate: 15 as number | null,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { tax_rate: db.taxRate }, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({ eq: async () => ({ data: db.existing, error: null }) }),
        insert: (rows: Record<string, unknown> | Array<Record<string, unknown>>) => {
          const list = Array.isArray(rows) ? rows : [rows];
          db.inserts.push(...list);
          const result = { data: list.map((_, i) => ({ id: `new-${i}` })), error: null };
          return {
            select: async () => result,
            then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
          };
        },
        update: (patch: Record<string, unknown>) => {
          const call = { patch, filters: [] as Array<[string, unknown]> };
          db.updates.push(call);
          const chain = {
            eq: (k: string, v: unknown) => {
              call.filters.push([k, v]);
              return chain;
            },
            then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
          };
          return chain;
        },
      };
    },
  }),
}));

import { createMaterial, importMaterials, importSupplierQuoteItems } from "./actions";

beforeEach(() => {
  db.existing = [{ id: "m1", name: "Pine 90x45" }];
  db.taxRate = 15;
  db.inserts = [];
  db.updates = [];
});

const row = (over: Partial<Parameters<typeof importMaterials>[0][number]> = {}) => ({
  name: "pine 90x45",
  unit: "length",
  default_unit_price: 12.5 as number | null,
  supplier: null as string | null,
  supplier_url: null as string | null,
  notes: null as string | null,
  ...over,
});

describe("importMaterials — re-importing a CSV", () => {
  it("never overwrites an existing price, supplier or notes with nothing", async () => {
    const res = await importMaterials([row({ default_unit_price: null })]);
    expect(res).toMatchObject({ updated: 1, failed: 0 });
    const { patch } = db.updates[0];
    expect(patch).not.toHaveProperty("default_unit_price");
    expect(patch).not.toHaveProperty("supplier");
    expect(patch).not.toHaveProperty("supplier_url");
    expect(patch).not.toHaveProperty("notes");
  });

  it("updates only the fields the file carries", async () => {
    await importMaterials([row({ default_unit_price: 13.9, supplier: "ITM" })]);
    const { patch, filters } = db.updates[0];
    expect(patch).toMatchObject({ unit: "length", default_unit_price: 13.9, supplier: "ITM" });
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("supplier_url");
    expect(filters).toEqual([["id", "m1"], ["user_id", "user-1"]]);
  });

  it("inserts a new row without a price as 'no price set' (null), not $0", async () => {
    db.existing = [];
    await importMaterials([row({ name: "Custom flashing", default_unit_price: null })]);
    expect(db.inserts[0]).toMatchObject({ name: "Custom flashing", default_unit_price: null });
  });

  it("rejects a negative or non-numeric price server-side instead of saving it", async () => {
    db.existing = [];
    const res = await importMaterials([
      row({ name: "Bad", default_unit_price: -5 }),
      row({ name: "Worse", default_unit_price: Number.NaN }),
      row({ name: "Good", default_unit_price: 4 }),
    ]);
    expect(res).toMatchObject({ inserted: 1, failed: 2 });
    expect(db.inserts.map((r) => r.name)).toEqual(["Good"]);
  });
});

describe("importSupplierQuoteItems — saving scanned prices to the library", () => {
  it("keeps the existing supplier, SKU and notes when the scan didn't carry them", async () => {
    const res = await importSupplierQuoteItems(
      [{ name: "Pine 90x45", unit: "length", default_unit_price: 12.4, sku: null, notes: null }],
      null,
    );
    expect(res).toMatchObject({ updated: 1 });
    const { patch } = db.updates[0];
    expect(patch).toMatchObject({ default_unit_price: 12.4 });
    expect(patch).not.toHaveProperty("supplier");
    expect(patch).not.toHaveProperty("sku");
    expect(patch).not.toHaveProperty("notes");
  });

  it("never writes a $0 price over an existing one", async () => {
    const res = await importSupplierQuoteItems(
      [{ name: "Pine 90x45", unit: "length", default_unit_price: 0, sku: null, notes: null }],
      "ITM",
    );
    expect(db.updates).toEqual([]);
    expect(res.updated).toBe(0);
  });
});

describe("createMaterial — manual entry GST choice", () => {
  function form(fields: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  }

  it("saves an inc-GST price ex-GST when 'price includes GST' is ticked", async () => {
    await expect(
      createMaterial({ ok: true }, form({ name: "Hinge", unit: "each", default_unit_price: "11.50", price_includes_gst: "on" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(db.inserts[0]).toMatchObject({ name: "Hinge", default_unit_price: 10 });
  });

  it("defaults to ex-GST: the price is saved as typed", async () => {
    await expect(
      createMaterial({ ok: true }, form({ name: "Hinge", unit: "each", default_unit_price: "11.50" })),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(db.inserts[0]).toMatchObject({ default_unit_price: 11.5 });
  });
});
