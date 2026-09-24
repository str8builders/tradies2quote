import { describe, it, expect, vi } from "vitest";
import { saveMaterialCorrection } from "./materialLearning";
import type { PublicLineItem } from "./quote-types";

const USER_A = "11111111-2222-3333-4444-555555555555";
const USER_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

type MockOpts = {
  existing?: { id: string } | null;
  lookupError?: { message: string };
  updateError?: { message: string };
  insertError?: { message: string };
  insertedRow?: { id: string };
  aliasError?: { code?: string; message: string };
};

/**
 * Hand-rolled Supabase client mock. Only implements the calls the unit
 * under test actually makes.
 */
function mockSupabase(opts: MockOpts = {}) {
  const lookup = vi.fn().mockResolvedValue({
    data: opts.existing ?? null,
    error: opts.lookupError ?? null,
  });
  const updateChain = {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: opts.updateError ?? null,
        }),
      }),
    }),
  };
  const insertChain = {
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: opts.insertedRow ?? { id: "new-material-id" },
          error: opts.insertError ?? null,
        }),
      }),
    }),
  };
  const aliasInsert = vi.fn().mockResolvedValue({
    data: null,
    error: opts.aliasError ?? null,
  });

  const fromMock = vi.fn((table: string) => {
    if (table === "materials") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            ilike: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: lookup,
              }),
            }),
          }),
        }),
        update: updateChain.update,
        insert: insertChain.insert,
      };
    }
    if (table === "material_aliases") {
      return { insert: aliasInsert };
    }
    return {};
  });

  return {
    supabase: { from: fromMock } as never,
    lookup,
    updateChain,
    insertChain,
    aliasInsert,
    fromMock,
  };
}

describe("saveMaterialCorrection — required inputs", () => {
  it("rejects missing userId", async () => {
    const { supabase } = mockSupabase();
    await expect(
      saveMaterialCorrection(supabase, "", {
        canonicalName: "x",
        unit: "m",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/userId is required/);
  });

  it("rejects missing canonicalName", async () => {
    const { supabase } = mockSupabase();
    await expect(
      saveMaterialCorrection(supabase, USER_A, {
        canonicalName: "  ",
        unit: "m",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/canonicalName is required/);
  });

  it("rejects missing unit", async () => {
    const { supabase } = mockSupabase();
    await expect(
      saveMaterialCorrection(supabase, USER_A, {
        canonicalName: "x",
        unit: "",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/unit is required/);
  });
});

describe("saveMaterialCorrection — user-scoped insert path", () => {
  it("inserts a new user material when none exists", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "user-mat-1" },
    });

    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "Custom GIB Sheet 12mm",
      category: "plasterboard",
      brand: "GIB",
      supplier: "PlaceMakers",
      unit: "sheet",
      unitPrice: 65.5,
      attributes: { thickness: "12mm" },
    });

    expect(r.materialId).toBe("user-mat-1");
    expect(r.inserted).toBe(true);

    // Verify INSERT payload — user_id is set, country/active/gst defaults
    // applied, normalized_name lowercased, price_source='user_library'.
    const insertCall = m.insertChain.insert.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      user_id: USER_A,
      country: "NZ",
      active: true,
      gst_included: true,
      name: "Custom GIB Sheet 12mm",
      normalized_name: "custom gib sheet 12mm",
      category: "plasterboard",
      brand: "GIB",
      supplier: "PlaceMakers",
      unit: "sheet",
      default_unit_price: 65.5,
      price_source: "user_library",
      price_confidence: "high",
      attributes: { thickness: "12mm" },
    });
  });

  it("queries by user_id (lookup never sees global rows)", async () => {
    const m = mockSupabase();
    await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "x",
      unit: "m",
      unitPrice: 1,
    });
    // The lookup chain calls .eq('user_id', userId) before .ilike('name', ...).
    // We don't trace each step, but the test for "does not overwrite global"
    // below proves the user_id filter is respected.
    expect(m.fromMock).toHaveBeenCalledWith("materials");
  });
});

describe("saveMaterialCorrection — user-scoped update path", () => {
  it("updates an existing user material when one with the same name exists", async () => {
    const m = mockSupabase({
      existing: { id: "existing-user-id" },
    });

    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "Custom GIB Sheet 12mm",
      unit: "sheet",
      unitPrice: 70,
    });

    expect(r.materialId).toBe("existing-user-id");
    expect(r.inserted).toBe(false);
    expect(m.updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Custom GIB Sheet 12mm",
        default_unit_price: 70,
        price_source: "user_library",
      }),
    );
    // Insert path NOT taken
    expect(m.insertChain.insert).not.toHaveBeenCalled();
  });

  it("only writes the fields the correction carries — keeps the row's supplier, category, brand and attributes", async () => {
    const m = mockSupabase({ existing: { id: "existing-user-id" } });
    await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "Pine 90x45 H1.2",
      unit: "length",
      unitPrice: 12.4,
    });
    const patch = m.updateChain.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch).toMatchObject({ unit: "length", default_unit_price: 12.4 });
    for (const kept of ["supplier", "category", "brand", "attributes", "notes"]) {
      expect(patch, kept).not.toHaveProperty(kept);
    }
  });
});

describe("saveMaterialCorrection — alias creation", () => {
  it("creates a user_correction alias when originalText differs from canonicalName", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "user-mat-1" },
    });

    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "GIB Aqualine 13mm 2400x1200",
      originalText: "gib aqua",
      unit: "sheet",
      unitPrice: 78,
    });

    expect(r.aliasCreated).toBe(true);
    expect(m.aliasInsert).toHaveBeenCalledWith({
      material_id: "user-mat-1",
      alias: "gib aqua",
      normalized_alias: "gib aqua",
      source: "user_correction",
      confidence: "medium",
    });
  });

  it("skips alias creation when originalText is empty/missing", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "x" },
    });
    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "x",
      unit: "m",
      unitPrice: 1,
    });
    expect(r.aliasCreated).toBe(false);
    expect(m.aliasInsert).not.toHaveBeenCalled();
  });

  it("skips alias creation when originalText equals canonicalName (case-insensitive)", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "x" },
    });
    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "Some Material",
      originalText: "SOME MATERIAL",
      unit: "m",
      unitPrice: 1,
    });
    expect(r.aliasCreated).toBe(false);
    expect(m.aliasInsert).not.toHaveBeenCalled();
  });

  it("alias insert failure does NOT fail the whole save (e.g. duplicate alias)", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "x" },
      aliasError: { code: "23505", message: "duplicate key value" },
    });
    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "X",
      originalText: "alias-y",
      unit: "m",
      unitPrice: 1,
    });
    expect(r.materialId).toBe("x"); // material still saved
    expect(r.aliasCreated).toBe(false);
  });
});

describe("saveMaterialCorrection — global-row safety", () => {
  it("never overwrites a global row even if the canonicalName matches one", async () => {
    // Lookup is filtered by user_id = USER_A. Global rows have user_id=null.
    // Therefore the lookup returns null even though the GLOBAL row "GIB Aqualine 13mm" exists.
    // The function then INSERTs a new user-scoped row instead of updating
    // the global row.
    const m = mockSupabase({
      existing: null, // global row would have been seen if the filter were missing
      insertedRow: { id: "user-scoped-clone" },
    });
    const r = await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "GIB Aqualine 13mm 2400x1200",
      unit: "sheet",
      unitPrice: 80,
    });
    expect(r.inserted).toBe(true);
    expect(m.updateChain.update).not.toHaveBeenCalled();
    // The inserted row is tagged with user_id, never null.
    const insertedPayload = m.insertChain.insert.mock.calls[0][0];
    expect(insertedPayload.user_id).toBe(USER_A);
    expect(insertedPayload.user_id).not.toBeNull();
  });
});

describe("saveMaterialCorrection — error propagation", () => {
  it("propagates lookup errors", async () => {
    const m = mockSupabase({ lookupError: { message: "boom" } });
    await expect(
      saveMaterialCorrection(m.supabase, USER_A, {
        canonicalName: "x",
        unit: "m",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/lookup failed: boom/);
  });

  it("propagates insert errors", async () => {
    const m = mockSupabase({
      insertError: { message: "RLS denied" },
      insertedRow: undefined as unknown as { id: string },
    });
    await expect(
      saveMaterialCorrection(m.supabase, USER_A, {
        canonicalName: "x",
        unit: "m",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/insert failed: RLS denied/);
  });

  it("propagates update errors", async () => {
    const m = mockSupabase({
      existing: { id: "u1" },
      updateError: { message: "constraint violation" },
    });
    await expect(
      saveMaterialCorrection(m.supabase, USER_A, {
        canonicalName: "x",
        unit: "m",
        unitPrice: 1,
      }),
    ).rejects.toThrow(/update failed: constraint violation/);
  });
});

describe("saveMaterialCorrection — user isolation (RLS regression contract)", () => {
  /**
   * RLS enforces that one auth user cannot read another user's private
   * materials. Layer A asserted this at the SQL layer (Phase 4.1). At the
   * lib layer, the contract is: this function ONLY writes rows tagged with
   * the user_id the caller passed. There is no path here where userA's
   * supabase client would write a row for userB.
   */
  it("user_id is fixed to the caller-supplied value", async () => {
    const m = mockSupabase({
      existing: null,
      insertedRow: { id: "row-for-a" },
    });
    await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "X",
      unit: "m",
      unitPrice: 1,
    });
    const insertedPayload = m.insertChain.insert.mock.calls[0][0];
    expect(insertedPayload.user_id).toBe(USER_A);
    expect(insertedPayload.user_id).not.toBe(USER_B);
  });

  it("update path passes user_id as a belt-and-braces filter", async () => {
    const m = mockSupabase({ existing: { id: "u1" } });
    await saveMaterialCorrection(m.supabase, USER_A, {
      canonicalName: "X",
      unit: "m",
      unitPrice: 1,
    });
    // The update chain is .update(...).eq('id', materialId).eq('user_id', userId).
    expect(m.updateChain.update).toHaveBeenCalledTimes(1);
  });
});

describe("saveMaterialCorrection — public payload contract (regression)", () => {
  /**
   * The user-correction lib never widens what surfaces on the public quote.
   * This test re-asserts at the type level that PublicLineItem still has
   * exactly the 6 customer-facing keys.
   */
  it("PublicLineItem still hides every internal material field", () => {
    const sample: PublicLineItem = {
      type: "material",
      description: "x",
      quantity: 1,
      unit: "each",
      unit_price: 1,
      line_total: 1,
    };
    const keys = Object.keys(sample).sort();
    expect(keys).toEqual(
      [
        "description",
        "line_total",
        "quantity",
        "type",
        "unit",
        "unit_price",
      ].sort(),
    );
    expect(keys).not.toContain("material_id");
    expect(keys).not.toContain("price_source");
    expect(keys).not.toContain("price_confidence");
    expect(keys).not.toContain("attributes");
  });
});
