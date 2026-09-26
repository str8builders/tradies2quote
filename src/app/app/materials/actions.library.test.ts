import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeOp, type FakeResult } from "@/test/fake-supabase";

// Saving imported prices: names listed twice, matching saved items by code
// then name, bulk writes (one insert per 500 rows, one upsert per group of
// updates) and the row-by-row safety net when a bulk write fails.

const env = vi.hoisted(() => ({
  saved: [] as Array<{ id: string; name: string; sku: string | null; notes: string | null }>,
  taxRate: 15,
  respond: null as null | ((op: FakeOp) => FakeResult),
  ops: [] as FakeOp[],
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const db = fakeSupabase((op) => {
      if (env.respond) {
        const r = env.respond(op);
        if (r) return r;
      }
      if (op.table === "profiles") return { data: { tax_rate: env.taxRate } };
      if (op.action === "select") return { data: env.saved };
      const values = Array.isArray(op.values) ? op.values : [op.values];
      return { data: values.map((_, i) => ({ id: `id-${i}` })) };
    });
    env.ops = db.ops;
    return { auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }, from: db.from };
  },
}));

import { importMaterials, importSupplierQuoteItems } from "./actions";

const writes = (action: FakeOp["action"]) => env.ops.filter((o) => o.table === "materials" && o.action === action);
const rowsOf = (op: FakeOp) => (Array.isArray(op.values) ? op.values : [op.values]) as Array<Record<string, unknown>>;

const row = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  unit: null as string | null,
  default_unit_price: 10 as number | null,
  sku: null as string | null,
  supplier: null as string | null,
  supplier_url: null as string | null,
  notes: null as string | null,
  ...over,
});

beforeEach(() => {
  env.saved = [];
  env.respond = null;
  env.taxRate = 15;
});

describe("importMaterials — price lists", () => {
  it("inserts new rows in one bulk write, unit 'each' when the file had none, code in the code", async () => {
    const res = await importMaterials([row("Hinge", { sku: "H-1" }), row("Screws 50mm", { unit: "box", default_unit_price: 12.5 })]);
    expect(res).toMatchObject({ inserted: 2, updated: 0, failed: 0, problems: [], merged: [] });
    expect(writes("insert")).toHaveLength(1);
    expect(rowsOf(writes("insert")[0])).toEqual([
      expect.objectContaining({ user_id: "user-1", name: "Hinge", unit: "each", sku: "H-1", notes: null, is_ai_estimated: false }),
      expect.objectContaining({ name: "Screws 50mm", unit: "box", default_unit_price: 12.5, sku: null }),
    ]);
  });

  it("saves a name listed twice once — the last row — and reports it", async () => {
    const res = await importMaterials([row("Pine 90x45", { default_unit_price: 4.5 }), row("pine  90X45", { default_unit_price: 4.85 })]);
    expect(res.inserted).toBe(1);
    expect(res.merged).toEqual([{ name: "pine  90X45", count: 2 }]);
    expect(rowsOf(writes("insert")[0])).toEqual([expect.objectContaining({ default_unit_price: 4.85 })]);
  });

  it("matches saved items by code first, then by name, and updates them in bulk", async () => {
    env.saved = [
      { id: "m1", name: "Framing 90x45 (old name)", sku: "KT9045", notes: null },
      { id: "m2", name: "GIB Standard 10mm", sku: null, notes: "cut list in the ute" },
      { id: "m3", name: "Nails 75mm", sku: null, notes: null },
    ];
    const res = await importMaterials([
      row("90x45 H1.2 SG8 Pine", { sku: "kt9045", default_unit_price: 4.85, unit: "m" }),
      row("gib standard 10mm", { default_unit_price: 24.5, unit: "sheet", notes: "from the list" }),
      row("NAILS 75MM", { default_unit_price: 12, unit: "box" }),
    ]);
    expect(res).toMatchObject({ inserted: 0, updated: 3, failed: 0 });
    expect(writes("insert")).toHaveLength(0);
    expect(writes("update")).toHaveLength(0);
    // One bulk write per set of changed fields, never one request per row.
    const upserts = writes("upsert").map(rowsOf);
    expect(upserts).toEqual([
      [{ id: "m1", user_id: "user-1", name: "Framing 90x45 (old name)", unit: "m", default_unit_price: 4.85, is_ai_estimated: false, sku: "kt9045" }],
      [
        // The saved name stays; the tradie's own notes are never replaced.
        { id: "m2", user_id: "user-1", name: "GIB Standard 10mm", unit: "sheet", default_unit_price: 24.5, is_ai_estimated: false },
        { id: "m3", user_id: "user-1", name: "Nails 75mm", unit: "box", default_unit_price: 12, is_ai_estimated: false },
      ],
    ]);
  });

  it("never overwrites a saved value with a blank cell, and counts items with nothing new", async () => {
    env.saved = [{ id: "m1", name: "Hinge", sku: "H-1", notes: null }];
    const res = await importMaterials([row("Hinge", { default_unit_price: null })]);
    expect(res).toMatchObject({ updated: 0, unchanged: 1, failed: 0 });
    expect(writes("upsert")).toHaveLength(0);
    expect(writes("update")).toHaveLength(0);
  });

  it("falls back to row-by-row when a bulk insert fails, naming the row that still can't be saved", async () => {
    env.respond = (op) => {
      if (op.action !== "insert") return undefined;
      const values = rowsOf(op);
      if (values.length > 1) return { error: { code: "23505", message: "duplicate key" } };
      if (values[0].name === "Hinge") return { error: { code: "23505", message: "duplicate key" } };
      return { data: [{ id: "x" }] };
    };
    const res = await importMaterials([row("Hinge"), row("Nails"), row("Screws")]);
    expect(res).toMatchObject({ inserted: 2, failed: 1 });
    expect(res.problems).toEqual([{ name: "Hinge", reason: "Already in your prices under that name" }]);
    expect(writes("insert")).toHaveLength(4);
  });

  it("falls back to single updates when the bulk update fails", async () => {
    env.saved = [
      { id: "m1", name: "Hinge", sku: null, notes: null },
      { id: "m2", name: "Nails", sku: null, notes: null },
    ];
    env.respond = (op) => (op.action === "upsert" ? { error: { code: "42501", message: "denied" } } : undefined);
    const res = await importMaterials([row("Hinge", { default_unit_price: 3 }), row("Nails", { default_unit_price: 9 })]);
    expect(res).toMatchObject({ updated: 2, failed: 0 });
    const single = writes("update");
    expect(single).toHaveLength(2);
    expect(single[0].filters).toEqual([
      ["eq", "id", "m1"],
      ["eq", "user_id", "user-1"],
    ]);
  });

  it("turns away more than 5,000 rows with a clear message and writes nothing", async () => {
    const many = Array.from({ length: 5001 }, (_, i) => row(`Item ${i}`));
    const res = await importMaterials(many);
    expect(res.error).toMatch(/5,001 rows\. Import up to 5,000 at a time/);
    expect(env.ops).toHaveLength(0);
  });

  it("marks prices the AI read off a PDF or photo as scanned estimates to confirm", async () => {
    env.saved = [{ id: "m1", name: "Hinge", sku: null, notes: null }];
    await importMaterials([row("Hinge", { default_unit_price: 4 }), row("Nails", { default_unit_price: 9 })], { source: "scan" });
    expect(rowsOf(writes("insert")[0])[0]).toMatchObject({ name: "Nails", is_ai_estimated: true, price_source: "supplier_import" });
    expect(rowsOf(writes("upsert")[0])[0]).toMatchObject({ id: "m1", is_ai_estimated: true, price_source: "supplier_import" });
  });

  it("converts GST-inclusive prices once, after merging", async () => {
    await importMaterials([row("Hinge", { default_unit_price: 11.5 })], { pricesIncludeGst: true });
    expect(rowsOf(writes("insert")[0])[0]).toMatchObject({ default_unit_price: 10 });
  });
});

describe("importSupplierQuoteItems — a scanned quote into the library", () => {
  const scanned = (name: string, price: number, over: Record<string, unknown> = {}) => ({
    name,
    unit: "each",
    default_unit_price: price,
    sku: null as string | null,
    notes: null as string | null,
    ...over,
  });

  it("merges a repeated name, keeping the clearer read, so the batch can't fail on the name rule", async () => {
    const res = await importSupplierQuoteItems(
      [scanned("Joist hanger 190", 4.2, { confidence: 0.6 }), scanned("Nails", 12, { confidence: 0.9 }), scanned("joist hanger 190", 4.35, { confidence: 0.95, sku: "JH190" })],
      "Kauri Timber Supplies",
    );
    expect(res).toMatchObject({ inserted: 2, failed: 0, failedNames: [] });
    expect(res.merged).toEqual([{ name: "joist hanger 190", count: 2 }]);
    const inserted = rowsOf(writes("insert")[0]);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]).toMatchObject({
      name: "joist hanger 190",
      default_unit_price: 4.35,
      sku: "JH190",
      supplier: "Kauri Timber Supplies",
      is_ai_estimated: true,
      price_source: "supplier_import",
    });
  });

  it("when the bulk insert fails, saves the rest one by one and names what failed", async () => {
    env.respond = (op) => {
      if (op.action !== "insert") return undefined;
      const values = rowsOf(op);
      if (values.length > 1 || values[0].name === "Bad line") return { error: { code: "22P02", message: "invalid" } };
      return { data: [{ id: "x" }] };
    };
    const res = await importSupplierQuoteItems([scanned("Good line", 5), scanned("Bad line", 6), scanned("Other", 7)], null);
    expect(res).toMatchObject({ inserted: 2, failed: 1, failedNames: ["Bad line"] });
  });

  it("matches a saved item by its supplier code before its name", async () => {
    env.saved = [{ id: "m9", name: "My joist hangers", sku: "JH190", notes: "use the galv ones" }];
    const res = await importSupplierQuoteItems([scanned("Joist Hanger 190mm", 4.35, { sku: "JH190" })], null);
    expect(res).toMatchObject({ inserted: 0, updated: 1 });
    const [upserted] = rowsOf(writes("upsert")[0]);
    expect(upserted).toMatchObject({ id: "m9", name: "My joist hangers", default_unit_price: 4.35, sku: "JH190" });
    expect(upserted).not.toHaveProperty("notes");
  });
});

describe("a library bigger than one page of the API", () => {
  it("reads every saved item before matching, so row 1,001 onwards still updates instead of clashing", async () => {
    const saved = Array.from({ length: 1500 }, (_, i) => ({ id: `m-${i}`, name: `Item ${i}`, sku: null, notes: null }));
    let reads = 0;
    env.respond = (op) => {
      if (op.table !== "materials" || op.action !== "select") return undefined;
      reads += 1;
      return { data: reads === 1 ? saved.slice(0, 1000) : saved.slice(1000) };
    };
    const res = await importMaterials([row("Item 1400", { unit: "each", default_unit_price: 12 })], { pricesIncludeGst: false });
    expect(reads).toBe(2);
    expect(writes("insert")).toHaveLength(0);
    expect(res).toMatchObject({ updated: 1 });
  });
});
