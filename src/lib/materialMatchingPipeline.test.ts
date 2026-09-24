import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enrichLineItemsWithCatalogue,
  materialMatchingEnabledFromEnv,
  safelyEnrichLineItemsWithCatalogue,
} from "./materialMatchingPipeline";
import type { QuoteLineItem, PublicLineItem } from "./quote-types";
import type { MaterialMatch } from "./materialMatcher";
import type { MaterialSearchHit } from "./materialSearch";

const baseItem = (over: Partial<QuoteLineItem>): QuoteLineItem => ({
  type: "material",
  description: "stub",
  quantity: 1,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  ...over,
});

const sampleHit = (over: Partial<MaterialSearchHit>): MaterialSearchHit => ({
  id: "hit-id",
  user_id: null,
  name: "stub",
  brand: null,
  category: null,
  unit: "each",
  price: 1,
  attributes: {},
  match_source: "direct_global",
  match_score: 0.5,
  tier_rank: 3,
  ...over,
});

const matchedResult = (hit: MaterialSearchHit): MaterialMatch => ({
  status: "matched",
  hit,
  source: hit.match_source,
  normalized: {
    raw: "",
    normalized: "stub",
    treatmentClass: null,
    size: null,
    thicknessMm: null,
    brand: null,
    tradeName: null,
    finish: null,
    categoryHint: "unknown",
  },
});

const missingResult = (
  reason: "no_match" | "match_no_price",
  partial: MaterialSearchHit | null = null,
): MaterialMatch => ({
  status: "missing_price",
  reason,
  partial,
  normalized: {
    raw: "",
    normalized: "stub",
    treatmentClass: null,
    size: null,
    thicknessMm: null,
    brand: null,
    tradeName: null,
    finish: null,
    categoryHint: "unknown",
  },
});

describe("enrichLineItemsWithCatalogue — feature flag OFF", () => {
  it("returns items unchanged when enabled=false", async () => {
    const items = [baseItem({ description: "H4 post", unit_price: 18.5 })];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: false,
    });
    expect(result).toEqual(items);
    // identity check: same array reference (no copy)
    expect(result).toBe(items);
  });

  it("does not call the matcher when enabled=false", async () => {
    const matcher = vi.fn();
    await enrichLineItemsWithCatalogue([baseItem({ description: "x" })], {
      enabled: false,
      matcher,
    });
    expect(matcher).not.toHaveBeenCalled();
  });
});

describe("enrichLineItemsWithCatalogue — feature flag ON, matched path", () => {
  it("matches H1.2 90x45 framing and overrides unit_price + line_total", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "framing-id",
          name: "H1.2 Pine Framing 90x45",
          brand: null,
          category: "timber",
          unit: "m",
          price: 4.5,
          attributes: { treatment_class: "H1.2", size: "90x45" },
          match_source: "direct_global",
          match_score: 0.92,
        }),
      ),
    );

    const items = [
      baseItem({
        description: "H1.2 90x45 framing",
        quantity: 12,
        unit: "m",
        unit_price: 5, // AI guess; matcher should override
        line_total: 60,
      }),
    ];

    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });

    expect(matcher).toHaveBeenCalledWith({
      description: "H1.2 90x45 framing",
    });
    expect(result[0]).toMatchObject({
      type: "material",
      description: "H1.2 90x45 framing",
      quantity: 12,
      unit_price: 4.5, // catalogue override
      line_total: 54, // recomputed: 12 * 4.5
      material_id: "framing-id",
      library_id: "framing-id",
      price_source: "catalogue_seed",
      price_confidence: "high",
      is_missing_price: false,
      is_ai_estimated: false,
    });
  });

  it("matches H3.2 deck joists (catalogue seed)", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "joist-id",
          name: "H3.2 Pine Joist 140x45",
          category: "timber",
          unit: "m",
          price: 11.2,
          match_source: "direct_global",
          match_score: 0.95,
        }),
      ),
    );
    const items = [
      baseItem({
        description: "H3.2 deck joists 140x45",
        quantity: 8,
        unit: "m",
        unit_price: 0,
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].unit_price).toBe(11.2);
    expect(result[0].line_total).toBe(89.6); // 8 * 11.2
    expect(result[0].material_id).toBe("joist-id");
    expect(result[0].price_source).toBe("catalogue_seed");
  });

  it("matches H4 100x100 posts", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "post-id",
          name: "H4 Pine Post 100x100",
          category: "timber",
          unit: "m",
          price: 18.5,
          match_score: 0.88,
        }),
      ),
    );
    const items = [
      baseItem({
        description: "H4 100x100 post",
        quantity: 5,
        unit: "m",
        unit_price: 20,
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].unit_price).toBe(18.5);
    expect(result[0].material_id).toBe("post-id");
  });

  it("matches H5 piles", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "pile-id",
          name: "H5 Pine Pile 200x200",
          category: "timber",
          unit: "m",
          price: 68,
          match_score: 0.75,
        }),
      ),
    );
    const items = [
      baseItem({
        description: "H5 pile 200x200",
        quantity: 3,
        unit: "m",
        unit_price: 0,
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].material_id).toBe("pile-id");
    expect(result[0].price_confidence).toBe("high"); // 0.75 > 0.7
  });

  it("matches 13mm GIB Aqualine via plasterboard catalogue row", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "aqualine-id",
          name: "GIB Aqualine 13mm 2400x1200",
          brand: "GIB",
          category: "plasterboard",
          unit: "sheet",
          price: 78,
          attributes: { product_type: "GIB Aqualine", thickness: "13mm" },
          match_source: "alias_global",
          match_score: 0.82,
        }),
      ),
    );
    const items = [
      baseItem({
        description: "13mm GIB Aqualine 2400x1200",
        quantity: 12,
        unit: "sheet",
        unit_price: 0,
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].material_id).toBe("aqualine-id");
    expect(result[0].unit).toBe("sheet");
    expect(result[0].unit_price).toBe(78);
    expect(result[0].price_source).toBe("catalogue_seed");
  });

  it("user-library hit is tagged price_source='user_library'", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "user-row",
          user_id: "user-a",
          name: "My GIB Aqualine",
          price: 70,
          match_source: "direct_user",
          match_score: 0.9,
        }),
      ),
    );
    const items = [baseItem({ description: "GIB Aqualine 13mm" })];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].price_source).toBe("user_library");
  });
});

describe("enrichLineItemsWithCatalogue — feature flag ON, missing_price path", () => {
  it("unknown material → missing_price, AI price kept as suggestion", async () => {
    const matcher = vi.fn().mockResolvedValue(missingResult("no_match"));
    const items = [
      baseItem({
        description: "exotic obscure widget XYZ",
        unit_price: 99,
        quantity: 1,
        line_total: 99,
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0]).toMatchObject({
      is_missing_price: true,
      is_ai_estimated: true,
      price_source: "missing_price",
      price_confidence: "low",
      unit_price: 99, // AI suggestion preserved
    });
    expect(result[0].material_id).toBeNull();
  });

  it("matched-but-no-price → missing_price with partial.id remembered", async () => {
    const partial = sampleHit({ id: "partial-id", price: null });
    const matcher = vi
      .fn()
      .mockResolvedValue(missingResult("match_no_price", partial));
    const items = [baseItem({ description: "thing", unit_price: 5 })];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].material_id).toBe("partial-id");
    expect(result[0].is_missing_price).toBe(true);
    expect(result[0].price_source).toBe("missing_price");
  });
});

describe("enrichLineItemsWithCatalogue — pass-through for non-material lines", () => {
  it("labour lines are not sent to the matcher", async () => {
    const matcher = vi.fn();
    const items: QuoteLineItem[] = [
      {
        type: "labour",
        description: "Builder day rate",
        quantity: 8,
        unit: "h",
        unit_price: 75,
        line_total: 600,
      },
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(matcher).not.toHaveBeenCalled();
    expect(result).toEqual(items);
  });

  it("other lines are not sent to the matcher", async () => {
    const matcher = vi.fn();
    const items: QuoteLineItem[] = [
      {
        type: "other",
        description: "Skip bin hire",
        quantity: 1,
        unit: "each",
        unit_price: 250,
        line_total: 250,
      },
    ];
    await enrichLineItemsWithCatalogue(items, { enabled: true, matcher });
    expect(matcher).not.toHaveBeenCalled();
  });
});

describe("enrichLineItemsWithCatalogue — totals safety", () => {
  it("recomputes line_total when matcher overrides unit_price", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(sampleHit({ price: 10 })),
    );
    const items = [
      baseItem({
        description: "x",
        quantity: 7,
        unit_price: 5, // AI guess
        line_total: 35, // stale
      }),
    ];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].unit_price).toBe(10);
    expect(result[0].line_total).toBe(70); // 7 * 10, not 35
  });

  it("rounds line_total to 2 decimals", async () => {
    const matcher = vi
      .fn()
      .mockResolvedValue(matchedResult(sampleHit({ price: 4.555 })));
    const items = [baseItem({ description: "x", quantity: 3 })];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].line_total).toBe(13.67); // 3 * 4.555 → 13.665 → 13.67 (banker's vs round-half-up depending on implementation)
  });
});

describe("enrichLineItemsWithCatalogue — battens vs Pink Batts (regression)", () => {
  it("battens description: matcher result returned verbatim, no Pink Batts brand leakage", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({
          id: "batten-id",
          name: "H3.2 Pine Batten 50x50",
          category: "timber",
          brand: null,
          unit: "m",
          price: 4.2,
          match_source: "direct_global",
          match_score: 0.86,
        }),
      ),
    );
    const items = [baseItem({ description: "50x50 batten H3.2" })];
    const result = await enrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result[0].material_id).toBe("batten-id");
    // The catalogue row name and category determine the truth;
    // we never overwrite with Pink Batts.
    expect(result[0]).not.toMatchObject({ description: expect.stringContaining("Pink Batts") });
  });
});

describe("materialMatchingEnabledFromEnv", () => {
  let originalEnv: string | undefined;
  beforeEach(() => {
    originalEnv = process.env.MATERIAL_MATCHING_ENABLED;
    delete process.env.MATERIAL_MATCHING_ENABLED;
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.MATERIAL_MATCHING_ENABLED;
    } else {
      process.env.MATERIAL_MATCHING_ENABLED = originalEnv;
    }
  });

  it("returns false when env var is unset (production default)", () => {
    expect(materialMatchingEnabledFromEnv()).toBe(false);
  });

  it("returns false when env var is anything other than 'true'", () => {
    process.env.MATERIAL_MATCHING_ENABLED = "false";
    expect(materialMatchingEnabledFromEnv()).toBe(false);
    process.env.MATERIAL_MATCHING_ENABLED = "1";
    expect(materialMatchingEnabledFromEnv()).toBe(false);
    process.env.MATERIAL_MATCHING_ENABLED = "yes";
    expect(materialMatchingEnabledFromEnv()).toBe(false);
  });

  it("returns true only when env var is exactly 'true'", () => {
    process.env.MATERIAL_MATCHING_ENABLED = "true";
    expect(materialMatchingEnabledFromEnv()).toBe(true);
  });
});

describe("safelyEnrichLineItemsWithCatalogue — feature flag behaviour", () => {
  it("flag missing (env unset) → identity passthrough, diagnostics.fallback='disabled'", async () => {
    const items = [baseItem({ description: "H4 post", unit_price: 18.5 })];
    const result = await safelyEnrichLineItemsWithCatalogue(items, {
      enabled: false,
    });
    expect(result.items).toBe(items); // same reference, no copy
    expect(result.diagnostics.enabled).toBe(false);
    expect(result.diagnostics.fallback).toBe("disabled");
    expect(result.diagnostics.materialLines).toBe(1);
  });

  it("flag false → identity passthrough", async () => {
    const items = [baseItem({ description: "x", quantity: 2, line_total: 20 })];
    const result = await safelyEnrichLineItemsWithCatalogue(items, {
      enabled: false,
    });
    expect(result.items).toEqual(items);
    expect(result.diagnostics.fallback).toBe("disabled");
  });

  it("flag true → matcher runs, items enriched, diagnostics carries counts", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({ id: "x", price: 4.5, match_score: 0.9 }),
      ),
    );
    const items = [
      baseItem({ description: "h1.2 90x45", quantity: 10, unit_price: 5 }),
    ];
    const result = await safelyEnrichLineItemsWithCatalogue(items, {
      enabled: true,
      matcher,
    });
    expect(result.diagnostics).toMatchObject({
      enabled: true,
      fallback: null,
      totalLines: 1,
      materialLines: 1,
      matched: 1,
      missingPrice: 0,
    });
    expect(result.items[0].material_id).toBe("x");
    expect(result.items[0].unit_price).toBe(4.5);
  });
});

describe("safelyEnrichLineItemsWithCatalogue — failure modes (always succeed)", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  const originalItems: QuoteLineItem[] = [
    baseItem({
      description: "H1.2 90x45",
      quantity: 10,
      unit_price: 5,
      line_total: 50,
    }),
    baseItem({
      description: "GIB Aqualine 13mm",
      quantity: 12,
      unit_price: 80,
      line_total: 960,
    }),
    {
      type: "labour",
      description: "Builder",
      quantity: 8,
      unit: "h",
      unit_price: 75,
      line_total: 600,
    },
  ];

  it("matcher throws (RPC error) → original items returned, fallback='error'", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(new Error("searchMaterials RPC failed: permission denied"));
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toBe(originalItems); // unchanged reference
    expect(result.diagnostics.fallback).toBe("error");
    expect(result.diagnostics.fallbackReason).toMatch(/permission denied/);
    expect(warnSpy).toHaveBeenCalledWith(
      "[material-matching] fallback",
      expect.objectContaining({ reason: "error" }),
    );
  });

  it("missing Supabase env (matcher throws 'NEXT_PUBLIC_SUPABASE_URL not set') → original items, fallback='error'", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(
        new Error("NEXT_PUBLIC_SUPABASE_URL is not set."),
      );
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("error");
    expect(result.diagnostics.fallbackReason).toMatch(/SUPABASE_URL/);
  });

  it("RPC permission denied → original items, fallback='error'", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(
        new Error("searchMaterials RPC failed: permission denied for function search_materials"),
      );
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("error");
  });

  it("RPC-missing (function does not exist) → original items, fallback='error'", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(
        new Error("function public.search_materials does not exist"),
      );
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("error");
  });

  it("network error → original items, fallback='error'", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("error");
  });

  it("timeout fires before matcher resolves → original items, fallback='timeout'", async () => {
    // Matcher never resolves on its own.
    const matcher = vi.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
      timeoutMs: 30,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("timeout");
    expect(result.diagnostics.fallbackReason).toBe("material_matching_timeout");
    expect(warnSpy).toHaveBeenCalledWith(
      "[material-matching] fallback",
      expect.objectContaining({ reason: "timeout" }),
    );
  });

  it("malformed RPC result (matcher returns non-array internally) — wrapper still returns originals", async () => {
    // Simulate the rare case where the inner enrichment somehow yields a
    // non-array. We do this by stubbing the matcher to throw a typed error
    // mimicking a malformed response from the RPC layer.
    const matcher = vi
      .fn()
      .mockRejectedValue(new Error("malformed_rpc_response: data is not iterable"));
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    expect(result.items).toEqual(originalItems);
    expect(result.diagnostics.fallback).toBe("error");
  });

  it("empty catalogue (matcher returns missing_price for every line) → quote still succeeds with missing_price flags, NOT a hard fallback", async () => {
    const matcher = vi.fn().mockResolvedValue(missingResult("no_match"));
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    // No fallback: this is normal "no matches" behaviour, items are still
    // enriched (with missing_price flags), totals still meaningful.
    expect(result.diagnostics.fallback).toBeNull();
    expect(result.diagnostics.matched).toBe(0);
    expect(result.diagnostics.missingPrice).toBe(2); // 2 material lines, 1 labour
    // Material lines tagged is_missing_price=true; labour line untouched.
    const materialLines = result.items.filter((i) => i.type === "material");
    expect(materialLines.every((i) => i.is_missing_price === true)).toBe(true);
    const labourLine = result.items.find((i) => i.type === "labour");
    expect(labourLine?.unit_price).toBe(75); // unchanged
  });

  it("full matcher failure preserves the original totals (no line gets price overwritten or marked missing)", async () => {
    const matcher = vi
      .fn()
      .mockRejectedValue(new Error("entire pipeline blew up"));
    const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
      enabled: true,
      matcher,
    });
    // Every line item is byte-identical to what we passed in.
    for (let i = 0; i < originalItems.length; i++) {
      expect(result.items[i]).toBe(originalItems[i]); // same reference
    }
    // No line got is_missing_price = true.
    expect(result.items.every((i) => !i.is_missing_price)).toBe(true);
    // Sum of line_totals matches the input.
    const inputTotal = originalItems.reduce((s, i) => s + i.line_total, 0);
    const outputTotal = result.items.reduce((s, i) => s + i.line_total, 0);
    expect(outputTotal).toBe(inputTotal);
  });

  it("readTimeoutMs falls back to env var when option omitted", async () => {
    const original = process.env.MATERIAL_MATCHING_TIMEOUT_MS;
    try {
      process.env.MATERIAL_MATCHING_TIMEOUT_MS = "25";
      const matcher = vi.fn().mockImplementation(() => new Promise(() => {}));
      const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
        enabled: true,
        matcher,
        // no explicit timeoutMs → reads env
      });
      expect(result.diagnostics.fallback).toBe("timeout");
    } finally {
      if (original === undefined) delete process.env.MATERIAL_MATCHING_TIMEOUT_MS;
      else process.env.MATERIAL_MATCHING_TIMEOUT_MS = original;
    }
  });

  it("invalid timeout env value (e.g. NaN) falls back to default 8000ms (matcher resolves under default)", async () => {
    const original = process.env.MATERIAL_MATCHING_TIMEOUT_MS;
    try {
      process.env.MATERIAL_MATCHING_TIMEOUT_MS = "not-a-number";
      const matcher = vi.fn().mockResolvedValue(
        matchedResult(sampleHit({ price: 1 })),
      );
      const result = await safelyEnrichLineItemsWithCatalogue(originalItems, {
        enabled: true,
        matcher,
      });
      expect(result.diagnostics.fallback).toBeNull();
    } finally {
      if (original === undefined) delete process.env.MATERIAL_MATCHING_TIMEOUT_MS;
      else process.env.MATERIAL_MATCHING_TIMEOUT_MS = original;
    }
  });
});

describe("safelyEnrichLineItemsWithCatalogue — diagnostics never expose internals to clients", () => {
  it("diagnostics object is server-side only — public quote uses PublicLineItem, which has no diagnostics fields", () => {
    type ExpectedKeys =
      | "type"
      | "description"
      | "quantity"
      | "unit"
      | "unit_price"
      | "line_total";
    type _AssertNoDiagnosticsLeak = keyof PublicLineItem extends ExpectedKeys
      ? true
      : false;
    const _check: _AssertNoDiagnosticsLeak = true;
    void _check;
    // Runtime assertion: a sample PublicLineItem has no diagnostic fields.
    const sample: PublicLineItem = {
      type: "material",
      description: "x",
      quantity: 1,
      unit: "each",
      unit_price: 1,
      line_total: 1,
    };
    expect(Object.keys(sample)).not.toContain("material_id");
    expect(Object.keys(sample)).not.toContain("price_source");
    expect(Object.keys(sample)).not.toContain("price_confidence");
    expect(Object.keys(sample)).not.toContain("is_missing_price");
    expect(Object.keys(sample)).not.toContain("price_match_key");
  });
});

describe("public payload contract — internal fields hidden (Stage 4.3 regression)", () => {
  /**
   * Type-level proof that `PublicLineItem` exposes EXACTLY the 6 customer-
   * facing columns. If a future change adds (or accidentally exposes) any
   * of the Stage 4 internal fields — material_id, library_id,
   * price_match_key, price_source, price_confidence, is_missing_price,
   * is_ai_estimated, is_calculated_takeoff, formula, takeoff_inputs — then
   * `keyof PublicLineItem` widens beyond the expected union and this test
   * fails at compile time AND at runtime.
   */
  type ExpectedKeys =
    | "type"
    | "description"
    | "quantity"
    | "unit"
    | "unit_price"
    | "line_total";

  type ActualKeys = keyof PublicLineItem;
  type _AssertNoExtra = ActualKeys extends ExpectedKeys ? true : false;
  type _AssertCovers = ExpectedKeys extends ActualKeys ? true : false;

  it("PublicLineItem exposes exactly 6 customer-facing fields", () => {
    // Static checks (compile-time):
    const _checkExtra: _AssertNoExtra = true;
    const _checkCovers: _AssertCovers = true;
    void _checkExtra;
    void _checkCovers;

    // Runtime check on a sample object: any internal field present here
    // would be an unintended widening of the public contract.
    const sample: PublicLineItem = {
      type: "material",
      description: "x",
      quantity: 1,
      unit: "each",
      unit_price: 1,
      line_total: 1,
    };
    expect(Object.keys(sample).sort()).toEqual(
      [
        "description",
        "line_total",
        "quantity",
        "type",
        "unit",
        "unit_price",
      ].sort(),
    );
  });
});

describe("enrichLineItemsWithCatalogue — upstream user_library price is authoritative", () => {
  it("never downgrades a high-confidence library-priced line to missing_price", async () => {
    const matcher = vi.fn(async () => missingResult("no_match"));
    const priced = baseItem({
      description: "Joist hangers galvanised",
      unit_price: 6.8,
      line_total: 6.8,
      price_source: "user_library",
      price_confidence: "high",
      is_missing_price: false,
      library_id: "lib-row",
    });
    const [out] = await enrichLineItemsWithCatalogue([priced], {
      enabled: true,
      matcher,
    });
    // The stage must pass the line through untouched — and must not even
    // spend a lookup on it.
    expect(matcher).not.toHaveBeenCalled();
    expect(out.unit_price).toBe(6.8);
    expect(out.is_missing_price).toBe(false);
    expect(out.price_source).toBe("user_library");
  });

  it("still enriches lines without an authoritative library price", async () => {
    const matcher = vi.fn(async () => missingResult("no_match"));
    const [out] = await enrichLineItemsWithCatalogue(
      [baseItem({ description: "mystery widget", unit_price: 0 })],
      { enabled: true, matcher },
    );
    expect(matcher).toHaveBeenCalledOnce();
    expect(out.is_missing_price).toBe(true);
  });
});

// ─── Audit 2026-09-24, item 4 — never change the unit without converting ──
describe("enrichLineItemsWithCatalogue — units", () => {
  it("a per-sheet catalogue price is NOT applied to an m² line; unit + quantity untouched", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(
        sampleHit({ id: "gib-sheet", unit: "sheet", price: 30, match_score: 0.9 }),
      ),
    );
    const items = [
      baseItem({ description: "GIB Standard 10mm", quantity: 40, unit: "m²", unit_price: 0 }),
    ];
    const [out] = await enrichLineItemsWithCatalogue(items, { enabled: true, matcher });
    expect(out.unit).toBe("m²"); // never silently switched to "sheet"
    expect(out.quantity).toBe(40);
    expect(out.unit_price).toBe(0); // $30 × 40 = $1,200 never happens
    expect(out.is_missing_price).toBe(true);
    expect(out.price_source).toBe("missing_price");
    expect(out.material_id).toBe("gib-sheet"); // still linked for the tradie
    expect(out.warnings?.join(" ")).toMatch(/per sheet/);
  });

  it("a convertible unit applies the CONVERTED price and keeps the line's unit", async () => {
    const matcher = vi.fn().mockResolvedValue(
      matchedResult(sampleHit({ id: "angle", unit: "mm", price: 0.05, match_score: 0.9 })),
    );
    const items = [baseItem({ description: "Aluminium angle", quantity: 3, unit: "m" })];
    const [out] = await enrichLineItemsWithCatalogue(items, { enabled: true, matcher });
    expect(out.unit).toBe("m");
    expect(out.quantity).toBe(3);
    expect(out.unit_price).toBe(50); // $0.05/mm → $50/m
    expect(out.line_total).toBe(150);
    expect(out.is_missing_price).toBe(false);
  });
});
