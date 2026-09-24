import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock saveMaterialCorrection BEFORE the module under test imports it.
vi.mock("./materialLearning", () => ({
  saveMaterialCorrection: vi.fn(),
}));

import { applyMaterialCorrections } from "./quoteEditLearning";
import { saveMaterialCorrection } from "./materialLearning";
import type { QuoteLineItem } from "./quote-types";

const USER_A = "11111111-2222-3333-4444-555555555555";
const USER_B = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const fakeSupabase = {} as never;

const material = (over: Partial<QuoteLineItem>): QuoteLineItem => ({
  type: "material",
  description: "stub",
  quantity: 1,
  unit: "each",
  unit_price: 1,
  line_total: 1,
  ...over,
});

const labour = (over: Partial<QuoteLineItem>): QuoteLineItem => ({
  type: "labour",
  description: "Builder",
  quantity: 1,
  unit: "h",
  unit_price: 75,
  line_total: 75,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  (saveMaterialCorrection as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    materialId: "m1",
    inserted: true,
    aliasCreated: false,
  });
});

describe("applyMaterialCorrections — gating", () => {
  it("returns 0 when userId is missing", async () => {
    const result = await applyMaterialCorrections(fakeSupabase, "", [], []);
    expect(result).toEqual({ materialsLearned: 0, failed: 0 });
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
  });

  it("skips lines with empty description", async () => {
    const newItems = [material({ description: "  " })];
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      newItems,
      [],
    );
    expect(result.materialsLearned).toBe(0);
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
  });

  it("skips lines with non-finite or non-positive unit_price", async () => {
    const newItems = [
      material({ description: "X", unit_price: 0 }),
      material({ description: "Y", unit_price: -5 }),
      material({ description: "Z", unit_price: NaN as never }),
    ];
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      newItems,
      [],
    );
    expect(result.materialsLearned).toBe(0);
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
  });

  it("skips labour lines entirely", async () => {
    const newItems = [labour({ description: "Builder day rate" })];
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      newItems,
      [],
    );
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
    expect(result.materialsLearned).toBe(0);
  });

  it("skips 'other' lines entirely", async () => {
    const newItems: QuoteLineItem[] = [
      {
        type: "other",
        description: "Skip bin hire",
        quantity: 1,
        unit: "each",
        unit_price: 250,
        line_total: 250,
      },
    ];
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      newItems,
      [],
    );
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
    expect(result.materialsLearned).toBe(0);
  });
});

describe("applyMaterialCorrections — change detection", () => {
  it("does not save when material line is unchanged (positional match)", async () => {
    const line = material({
      description: "GIB Standard 13mm",
      unit: "sheet",
      unit_price: 56,
    });
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [line],
      [line],
    );
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
    expect(result.materialsLearned).toBe(0);
  });

  it("treats trimming + case as equivalent (no save)", async () => {
    const prior = material({
      description: "  gib standard 13mm  ",
      unit: "sheet",
      unit_price: 56,
    });
    const next = material({
      description: "GIB Standard 13mm",
      unit: "sheet",
      unit_price: 56,
    });
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [next],
      [prior],
    );
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
    expect(result.materialsLearned).toBe(0);
  });

  it("saves when unit_price changes (no alias — same name)", async () => {
    const prior = material({ description: "Stud", unit: "m", unit_price: 4 });
    const next = material({ description: "Stud", unit: "m", unit_price: 5.2 });
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [next],
      [prior],
    );
    expect(saveMaterialCorrection).toHaveBeenCalledTimes(1);
    expect(saveMaterialCorrection).toHaveBeenCalledWith(
      fakeSupabase,
      USER_A,
      expect.objectContaining({
        canonicalName: "Stud",
        unit: "m",
        unitPrice: 5.2,
        originalText: undefined,
      }),
    );
    expect(result.materialsLearned).toBe(1);
  });

  it("learns a renamed line under its new name but never guesses an alias from its position", async () => {
    const prior = material({
      description: "gib aqua",
      unit: "sheet",
      unit_price: 78,
    });
    const next = material({
      description: "GIB Aqualine 13mm 2400x1200",
      unit: "sheet",
      unit_price: 78,
    });
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [next],
      [prior],
    );
    expect(saveMaterialCorrection).toHaveBeenCalledWith(
      fakeSupabase,
      USER_A,
      expect.objectContaining({
        canonicalName: "GIB Aqualine 13mm 2400x1200",
        originalText: undefined,
      }),
    );
    expect(result.materialsLearned).toBe(1);
  });

  it("deleting a line doesn't make the next line an alias of the deleted one", async () => {
    const prior = [
      material({ description: "Pine 90x45 H1.2", unit: "length", unit_price: 12 }),
      material({ description: "GIB Standard 13mm", unit: "sheet", unit_price: 30 }),
    ];
    // The tradie removes the pine line and re-prices the GIB.
    const next = [material({ description: "GIB Standard 13mm", unit: "sheet", unit_price: 32 })];
    await applyMaterialCorrections(fakeSupabase, USER_A, next, prior);
    expect(saveMaterialCorrection).toHaveBeenCalledTimes(1);
    expect(saveMaterialCorrection).toHaveBeenCalledWith(
      fakeSupabase,
      USER_A,
      expect.objectContaining({ canonicalName: "GIB Standard 13mm", unitPrice: 32, originalText: undefined }),
    );
  });

  it("an unchanged line that moved up after a deletion is not re-learned", async () => {
    const prior = [
      material({ description: "Pine 90x45 H1.2", unit: "length", unit_price: 12 }),
      material({ description: "GIB Standard 13mm", unit: "sheet", unit_price: 30 }),
    ];
    const next = [material({ description: "GIB Standard 13mm", unit: "sheet", unit_price: 30 })];
    await applyMaterialCorrections(fakeSupabase, USER_A, next, prior);
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
  });

  it("matches by library_id (rename detected even if positions differ)", async () => {
    const prior = material({
      description: "gib aqua",
      unit: "sheet",
      unit_price: 78,
      library_id: "lib-xyz",
    });
    // New is at position 1 instead of 0 — but library_id pins it to prior.
    const newItems = [
      material({ description: "Some other line", unit_price: 10 }),
      material({
        description: "GIB Aqualine 13mm 2400x1200",
        unit: "sheet",
        unit_price: 80,
        library_id: "lib-xyz",
      }),
    ];
    await applyMaterialCorrections(fakeSupabase, USER_A, newItems, [prior]);
    expect(saveMaterialCorrection).toHaveBeenCalledWith(
      fakeSupabase,
      USER_A,
      expect.objectContaining({
        canonicalName: "GIB Aqualine 13mm 2400x1200",
        originalText: "gib aqua",
      }),
    );
  });

  it("treats new lines (no prior, no library_id) as a save with no alias", async () => {
    const next = material({
      description: "Custom Material",
      unit: "m",
      unit_price: 10,
    });
    await applyMaterialCorrections(fakeSupabase, USER_A, [next], []);
    expect(saveMaterialCorrection).toHaveBeenCalledWith(
      fakeSupabase,
      USER_A,
      expect.objectContaining({
        canonicalName: "Custom Material",
        originalText: undefined,
      }),
    );
  });
});

describe("applyMaterialCorrections — failure isolation", () => {
  it("a thrown saveMaterialCorrection does NOT propagate to the caller", async () => {
    (saveMaterialCorrection as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("RLS denied"),
    );
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [material({ description: "X", unit_price: 5 })],
      [],
    );
    expect(result.materialsLearned).toBe(0);
    expect(result.failed).toBe(1);
  });

  it("one failure does not stop subsequent corrections", async () => {
    const fn = saveMaterialCorrection as unknown as ReturnType<typeof vi.fn>;
    fn.mockResolvedValueOnce({ materialId: "m1", inserted: true, aliasCreated: false });
    fn.mockRejectedValueOnce(new Error("RLS denied"));
    fn.mockResolvedValueOnce({ materialId: "m3", inserted: true, aliasCreated: false });

    const items = [
      material({ description: "A", unit_price: 1 }),
      material({ description: "B", unit_price: 2 }),
      material({ description: "C", unit_price: 3 }),
    ];
    const result = await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      items,
      [],
    );
    expect(saveMaterialCorrection).toHaveBeenCalledTimes(3);
    expect(result.materialsLearned).toBe(2);
    expect(result.failed).toBe(1);
  });

  it("logs a server warning when a correction fails (no client-visible error)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (saveMaterialCorrection as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("boom"),
    );
    await applyMaterialCorrections(
      fakeSupabase,
      USER_A,
      [material({ description: "X", unit_price: 5 })],
      [],
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[material-learning] correction failed",
      expect.objectContaining({ userId: USER_A, message: "boom" }),
    );
    warnSpy.mockRestore();
  });
});

describe("applyMaterialCorrections — duplicate guard (delegated)", () => {
  /**
   * Idempotency for "same correction repeated" lives in
   * saveMaterialCorrection itself: lookup → update path. The orchestrator
   * trusts that, but we still verify the orchestrator never DOUBLE-calls
   * for an unchanged line that was already saved.
   */
  it("re-saving an unchanged quote does not re-call saveMaterialCorrection", async () => {
    const line = material({ description: "X", unit: "m", unit_price: 4.5 });
    await applyMaterialCorrections(fakeSupabase, USER_A, [line], [line]);
    await applyMaterialCorrections(fakeSupabase, USER_A, [line], [line]);
    expect(saveMaterialCorrection).not.toHaveBeenCalled();
  });
});

describe("applyMaterialCorrections — multi-user isolation contract", () => {
  /**
   * The orchestrator passes whatever userId the caller supplies. The
   * caller (saveQuoteChanges) reads userId from auth.getUser() — never
   * from request body — so a request from user A can never produce a
   * correction tagged as user B. We verify the orchestrator preserves
   * that boundary at its own layer.
   */
  it("does not mix userIds across calls", async () => {
    const line = material({ description: "X", unit_price: 5 });
    await applyMaterialCorrections(fakeSupabase, USER_A, [line], []);
    await applyMaterialCorrections(fakeSupabase, USER_B, [line], []);
    const calls = (saveMaterialCorrection as unknown as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(calls[0][1]).toBe(USER_A);
    expect(calls[1][1]).toBe(USER_B);
  });
});
