import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
  id: string;
  user_id: string | null;
  name: string;
  unit: string | null;
  default_unit_price: number | null;
  category: string | null;
  barcode: string | null;
};
type DbError = { code: string; message: string; details?: string };
type Call = {
  table: string;
  op: "select" | "insert" | "update";
  filters: Array<[string, unknown]>;
  payload?: Record<string, unknown>;
};

// A small in-memory stand-in for the materials table, including the two
// unique indexes the real table has: (user_id, name) and, from the barcode
// migration, (user_id, barcode) where barcode is not null.
const db = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  rows: [] as Row[],
  taxRate: 15 as number | null,
  calls: [] as Call[],
  failNext: null as DbError | null,
  beforeWrite: null as (() => void) | null,
  nextId: 0,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      const call: Call = { table, op: "select", filters: [] };
      db.calls.push(call);
      const matching = () =>
        db.rows.filter((r) =>
          call.filters.every(([k, v]) => (r as Record<string, unknown>)[k] === v),
        );
      const duplicate = (constraint: string, key: string): { data: null; error: DbError } => ({
        data: null,
        error: {
          code: "23505",
          message: `duplicate key value violates unique constraint "${constraint}"`,
          details: `Key (${key})=(…, ${call.payload?.[key.split(", ")[1]] ?? "…"}) already exists.`,
        },
      });
      const run = (): { data: unknown; error: DbError | null } => {
        // A write can be raced (another tab saved first) or fail outright.
        if (call.op !== "select") db.beforeWrite?.();
        if (db.failNext) {
          const error = db.failNext;
          db.failNext = null;
          return { data: null, error };
        }
        if (table === "profiles") return { data: [{ tax_rate: db.taxRate }], error: null };
        if (call.op === "insert") {
          const row = { id: `new-${++db.nextId}`, category: null, barcode: null, ...call.payload } as Row;
          if (row.barcode !== null && db.rows.some((r) => r.user_id === row.user_id && r.barcode === row.barcode)) {
            return duplicate("materials_user_barcode_key", "user_id, barcode");
          }
          if (db.rows.some((r) => r.user_id === row.user_id && r.name === row.name)) {
            return duplicate("materials_user_id_name_key", "user_id, name");
          }
          db.rows.push(row);
          return { data: [row], error: null };
        }
        if (call.op === "update") {
          const targets = matching();
          const patch = call.payload ?? {};
          for (const t of targets) {
            if (
              patch.barcode != null &&
              db.rows.some((r) => r !== t && r.user_id === t.user_id && r.barcode === patch.barcode)
            ) {
              return duplicate("materials_user_barcode_key", "user_id, barcode");
            }
          }
          for (const t of targets) Object.assign(t, patch);
          return { data: targets, error: null };
        }
        // Like PostgREST, hand back copies, never the stored rows themselves.
        return { data: matching().map((r) => ({ ...r })), error: null };
      };
      const first = async () => {
        const result = run();
        if (result.error) return result;
        return { data: (result.data as unknown[])[0] ?? null, error: null };
      };
      const query = {
        select: () => query,
        insert: (payload: Record<string, unknown>) => {
          call.op = "insert";
          call.payload = payload;
          return query;
        },
        update: (payload: Record<string, unknown>) => {
          call.op = "update";
          call.payload = payload;
          return query;
        },
        eq: (key: string, value: unknown) => {
          call.filters.push([key, value]);
          return query;
        },
        maybeSingle: first,
        single: first,
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(run()).then(resolve, reject),
      };
      return query;
    },
  }),
}));

import { captureError } from "@/lib/observability";
import { lookupBarcodeAction, saveBarcodeMaterialAction } from "./barcode-actions";

const SIKA_ID = "5d9a6a3e-6b1f-4c0e-9d8b-2f7c1a4e8b01";
const PINE_ID = "0f4b2c1d-3e5f-4a6b-8c7d-9e0f1a2b3c4d";
const THEIRS_ID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

const own = (over: Partial<Row>): Row => ({
  id: SIKA_ID,
  user_id: "user-1",
  name: "Sikaflex 11FC grey",
  unit: "each",
  default_unit_price: 14.35,
  category: "sealants",
  barcode: null,
  ...over,
});

const materialCalls = () => db.calls.filter((c) => c.table === "materials");
const writes = () => materialCalls().filter((c) => c.op !== "select");

beforeEach(() => {
  db.user = { id: "user-1" };
  db.rows = [];
  db.taxRate = 15;
  db.calls = [];
  db.failNext = null;
  db.beforeWrite = null;
  db.nextId = 0;
  vi.mocked(captureError).mockClear();
});

describe("lookupBarcodeAction", () => {
  it("finds the product in the tradie's own library", async () => {
    db.rows = [
      own({ barcode: "4006381333931" }),
      own({ id: THEIRS_ID, user_id: "user-2", name: "Someone else's", barcode: "4006381333931" }),
      own({ id: "global-1", user_id: null, name: "Catalogue row", barcode: "4006381333931" }),
    ];
    const result = await lookupBarcodeAction("4006381333931", "ean_13");
    expect(result).toEqual({
      ok: true,
      code: "4006381333931",
      material: { id: SIKA_ID, name: "Sikaflex 11FC grey", unit: "each", default_unit_price: 14.35, category: "sealants" },
    });
    // Scoped to the signed-in owner explicitly — RLS also lets shared
    // catalogue rows (user_id null) through, and those are not their library.
    expect(materialCalls()[0].filters).toContainEqual(["user_id", "user-1"]);
  });

  it("says the barcode is new when it isn't in their library", async () => {
    db.rows = [own({ barcode: "5901234123457" })];
    expect(await lookupBarcodeAction("4006381333931")).toEqual({
      ok: true,
      code: "4006381333931",
      material: null,
    });
  });

  it("normalises the code first, so a UPC-A read finds the EAN-13 it was saved as", async () => {
    db.rows = [own({ barcode: "0036000291452" })];
    const result = await lookupBarcodeAction("036000291452", "upc_a");
    expect(result).toMatchObject({ ok: true, code: "0036000291452", material: { id: SIKA_ID } });
  });

  it("rejects an invalid code without touching the database", async () => {
    const result = await lookupBarcodeAction("4006381333932", "ean_13");
    expect(result).toEqual({ error: expect.stringMatching(/don't add up/) });
    expect(materialCalls()).toEqual([]);
  });

  it("sends a signed-out visitor to sign in", async () => {
    db.user = null;
    await expect(lookupBarcodeAction("4006381333931")).rejects.toThrow("NEXT_REDIRECT /login");
    expect(materialCalls()).toEqual([]);
  });

  it("reports a failed read in plain words", async () => {
    db.failNext = { code: "57014", message: "canceling statement due to statement timeout" };
    const result = await lookupBarcodeAction("4006381333931");
    expect(result).toEqual({ error: "We couldn't check that barcode. Check your connection and try again." });
    expect(captureError).toHaveBeenCalled();
  });
});

describe("saveBarcodeMaterialAction — a new product", () => {
  it("saves it to the tradie's library with the barcode", async () => {
    const result = await saveBarcodeMaterialAction({
      code: "4006381333931",
      format: "ean_13",
      name: "  Sikaflex   11FC grey ",
      unit: "each",
      price: 14.35,
    });
    expect(result).toEqual({
      ok: true,
      attached: false,
      replaced: false,
      material: { id: "new-1", name: "Sikaflex 11FC grey", unit: "each", default_unit_price: 14.35, category: null },
    });
    const [insert] = writes();
    expect(insert.payload).toEqual({
      user_id: "user-1",
      name: "Sikaflex 11FC grey",
      unit: "each",
      default_unit_price: 14.35,
      barcode: "4006381333931",
      is_ai_estimated: false,
      price_source: "user_library",
      price_confidence: "high",
      gst_included: false,
    });
  });

  it("never takes the owner from the client", async () => {
    await saveBarcodeMaterialAction({
      code: "4006381333931",
      name: "Screws",
      unit: "box",
      price: "29.90",
      user_id: "user-2",
    } as unknown as Parameters<typeof saveBarcodeMaterialAction>[0]);
    expect(writes()[0].payload).toMatchObject({ user_id: "user-1", default_unit_price: 29.9 });
    expect(db.rows.every((r) => r.user_id === "user-1")).toBe(true);
  });

  it("stores a GST-inclusive shelf price ex GST, like every library price", async () => {
    await saveBarcodeMaterialAction({
      code: "4006381333931",
      name: "Screws",
      unit: "box",
      price: 11.5,
      priceIncludesGst: true,
    });
    expect(writes()[0].payload).toMatchObject({ default_unit_price: 10 });
  });

  it.each([
    [{ name: "" }, /Give it a name/],
    [{ name: "   " }, /Give it a name/],
    [{ name: "x".repeat(121) }, /under 120 characters/],
    [{ unit: "tonne" }, /Pick a unit/],
    [{ unit: undefined }, /Pick a unit/],
    [{ price: 0 }, /price above \$0/],
    [{ price: -4 }, /price above \$0/],
    [{ price: Number.NaN }, /price above \$0/],
    [{ price: "abc" }, /price above \$0/],
    [{ price: undefined }, /price above \$0/],
    [{ price: 2_000_000 }, /price above \$0/],
  ])("validates %j on the server", async (over, reason) => {
    const result = await saveBarcodeMaterialAction({
      code: "4006381333931",
      name: "Screws",
      unit: "box",
      price: 12,
      ...over,
    } as Parameters<typeof saveBarcodeMaterialAction>[0]);
    expect(result).toEqual({ error: expect.stringMatching(reason) });
    expect(writes()).toEqual([]);
  });

  it("rejects an invalid barcode without touching the database", async () => {
    const result = await saveBarcodeMaterialAction({ code: "12", name: "Screws", unit: "box", price: 12 });
    expect(result).toEqual({ error: expect.stringMatching(/too short/) });
    expect(materialCalls()).toEqual([]);
  });

  it("sends a signed-out visitor to sign in", async () => {
    db.user = null;
    await expect(
      saveBarcodeMaterialAction({ code: "4006381333931", name: "Screws", unit: "box", price: 12 }),
    ).rejects.toThrow("NEXT_REDIRECT /login");
    expect(materialCalls()).toEqual([]);
  });

  it("reports an unexpected save failure in plain words", async () => {
    db.beforeWrite = () => {
      db.failNext = { code: "XX000", message: "internal error" };
    };
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: "Screws", unit: "box", price: 12 });
    expect(result).toEqual({ error: "We couldn't save that. Check your connection and try again." });
    expect(captureError).toHaveBeenCalled();
  });
});

describe("saveBarcodeMaterialAction — attaching to an item already in the library", () => {
  it("adds the barcode to that item and nothing else", async () => {
    db.rows = [own({})];
    const result = await saveBarcodeMaterialAction({ code: "036000291452", format: "upc_a", materialId: SIKA_ID });
    expect(result).toEqual({
      ok: true,
      attached: true,
      replaced: false,
      material: { id: SIKA_ID, name: "Sikaflex 11FC grey", unit: "each", default_unit_price: 14.35, category: "sealants" },
    });
    const [update] = writes();
    expect(update.payload).toEqual({ barcode: "0036000291452" });
    expect(update.filters).toEqual([
      ["id", SIKA_ID],
      ["user_id", "user-1"],
    ]);
  });

  it("says when it replaced the item's old barcode", async () => {
    db.rows = [own({ barcode: "5901234123457" })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: SIKA_ID });
    expect(result).toMatchObject({ ok: true, attached: true, replaced: true });
    expect(db.rows[0].barcode).toBe("4006381333931");
  });

  it("changes nothing when the item already has that barcode", async () => {
    db.rows = [own({ barcode: "4006381333931" })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: SIKA_ID });
    expect(result).toMatchObject({ ok: true, attached: true, replaced: false });
    expect(writes()).toEqual([]);
  });

  it("won't touch an item that belongs to someone else", async () => {
    db.rows = [own({ id: THEIRS_ID, user_id: "user-2", name: "Their sealant" })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: THEIRS_ID });
    expect(result).toEqual({ error: "We couldn't find that item in your library." });
    expect(writes()).toEqual([]);
    expect(db.rows[0].barcode).toBeNull();
  });

  it("rejects a material id that isn't an id", async () => {
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: "1 or 1=1" });
    expect(result).toEqual({ error: "We couldn't find that item in your library." });
    expect(materialCalls()).toEqual([]);
  });
});

describe("saveBarcodeMaterialAction — duplicates", () => {
  it("names the item that already has the barcode", async () => {
    db.rows = [own({ barcode: "4006381333931" })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: "Sealant", unit: "each", price: 9 });
    expect(result).toEqual({
      error: "That barcode is already saved on Sikaflex 11FC grey.",
      conflict: { kind: "barcode", id: SIKA_ID, name: "Sikaflex 11FC grey" },
    });
    expect(writes()).toEqual([]);
  });

  it("names the item when only the database catches the duplicate barcode", async () => {
    db.beforeWrite = () => {
      if (!db.rows.length) db.rows.push(own({ barcode: "4006381333931" }));
    };
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: "Sealant", unit: "each", price: 9 });
    expect(result).toEqual({
      error: "That barcode is already saved on Sikaflex 11FC grey.",
      conflict: { kind: "barcode", id: SIKA_ID, name: "Sikaflex 11FC grey" },
    });
  });

  it("won't attach a barcode another of their items already has", async () => {
    db.rows = [
      own({ barcode: "4006381333931" }),
      own({ id: PINE_ID, name: "Pine 90x45", unit: "m", default_unit_price: 4.2 }),
    ];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: PINE_ID });
    expect(result).toEqual({
      error: "That barcode is already saved on Sikaflex 11FC grey.",
      conflict: { kind: "barcode", id: SIKA_ID, name: "Sikaflex 11FC grey" },
    });
    expect(writes()).toEqual([]);
  });

  it("names the item when only the database catches a duplicate on attach", async () => {
    db.rows = [own({ id: PINE_ID, name: "Pine 90x45" })];
    db.beforeWrite = () => {
      if (db.rows.length === 1) db.rows.push(own({ barcode: "4006381333931" }));
    };
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", materialId: PINE_ID });
    expect(result).toMatchObject({ error: "That barcode is already saved on Sikaflex 11FC grey." });
  });

  it("offers to attach instead when the name is already in their library", async () => {
    db.rows = [own({ id: PINE_ID, name: "Pine 90x45", unit: "m", default_unit_price: 4.2 })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: " pine 90X45 ", unit: "m", price: 5 });
    expect(result).toEqual({
      error: 'You already have "Pine 90x45" in your library. Add this barcode to it instead?',
      conflict: { kind: "name", id: PINE_ID, name: "Pine 90x45" },
    });
    expect(writes()).toEqual([]);
  });

  it("offers to attach when only the database catches the name clash", async () => {
    db.beforeWrite = () => {
      if (!db.rows.length) db.rows.push(own({ id: PINE_ID, name: "Pine 90x45" }));
    };
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: "Pine 90x45", unit: "m", price: 5 });
    expect(result).toEqual({
      error: 'You already have "Pine 90x45" in your library. Add this barcode to it instead?',
      conflict: { kind: "name", id: PINE_ID, name: "Pine 90x45" },
    });
  });

  it("reads the clash from the index, not from the words in the product's name", async () => {
    db.beforeWrite = () => {
      if (!db.rows.length) db.rows.push(own({ id: PINE_ID, name: "Barcode labels 50x25" }));
    };
    const result = await saveBarcodeMaterialAction({
      code: "4006381333931",
      name: "Barcode labels 50x25",
      unit: "roll",
      price: 5,
    });
    expect(result).toMatchObject({ conflict: { kind: "name", id: PINE_ID } });
  });

  it("ignores another tradie's item with the same name", async () => {
    db.rows = [own({ id: THEIRS_ID, user_id: "user-2", name: "Pine 90x45" })];
    const result = await saveBarcodeMaterialAction({ code: "4006381333931", name: "Pine 90x45", unit: "m", price: 5 });
    expect(result).toMatchObject({ ok: true, attached: false });
  });
});
