import { describe, expect, it } from "vitest";
import type { LibraryMaterial, QuoteLineItem } from "@/lib/quote-types";
import {
  applyPricingPolicy,
  extractStatedAmounts,
  matchesStatedAmount,
  priceLabourLine,
} from "../pricing";

/**
 * Audit 2026-09-24 — items 1 (labour repricing) and 3 (spoofed provenance).
 * These are the helpers run.ts applies in its AI-PRICES-OFF pass.
 */

const labour = (o: Partial<QuoteLineItem>): QuoteLineItem => ({
  type: "labour",
  description: "Labour",
  quantity: 1,
  unit: "hour",
  unit_price: 0,
  line_total: 0,
  ...o,
});

describe("extractStatedAmounts", () => {
  it("reads currency, word and rate forms", () => {
    const got = extractStatedAmounts(
      "2 days @ $600, then $2,500 fixed for the deck. Travel 40 dollars. Sparky at 90 an hour, 85/hr, $2.5k deposit.",
    ).sort((a, b) => a - b);
    expect(got).toEqual([40, 85, 90, 600, 2500]);
  });

  it("ignores bare numbers (quantities, sizes)", () => {
    expect(extractStatedAmounts("3 hours, 24 square metres, 90x45 studs")).toEqual([]);
  });
});

describe("priceLabourLine — only HOUR lines with no stated rate get the hourly rate", () => {
  const ctx = (stated: string) => ({
    hourlyRate: 75,
    statedAmounts: extractStatedAmounts(stated),
  });

  it('"2 days @ $600" keeps $600/day (was repriced to 2 × $75 = $150)', () => {
    const d = priceLabourLine(labour({ quantity: 2, unit: "day", unit_price: 600 }), ctx("Labour 2 days @ $600"));
    expect(d).toEqual({ unit_price: 600, is_missing_price: false, basis: "stated" });
  });

  it('"$2,500 fixed" keeps $2,500 (was repriced to $75)', () => {
    const d = priceLabourLine(labour({ quantity: 1, unit: "lot", unit_price: 2500 }), ctx("Labour $2,500 fixed"));
    expect(d.unit_price).toBe(2500);
    expect(d.basis).toBe("stated");
  });

  it("a stated line TOTAL also counts (2 days for $1,200 → $600/day)", () => {
    const d = priceLabourLine(labour({ quantity: 2, unit: "day", unit_price: 600 }), ctx("two days, $1,200 all up"));
    expect(d.unit_price).toBe(600);
  });

  it("a stated hourly rate is kept on an hour line", () => {
    const d = priceLabourLine(labour({ quantity: 10, unit: "hours", unit_price: 90 }), ctx("sparky at $90 an hour"));
    expect(d).toMatchObject({ unit_price: 90, basis: "stated" });
  });

  it("an hour line with no stated rate gets the profile rate (model's guess discarded)", () => {
    const d = priceLabourLine(labour({ quantity: 10, unit: "hour", unit_price: 95 }), ctx("frame the wall"));
    expect(d).toEqual({ unit_price: 75, is_missing_price: false, basis: "hourly_rate" });
    // blank unit = the prompt's default hour unit
    expect(priceLabourLine(labour({ unit: "", unit_price: 0 }), ctx("")).unit_price).toBe(75);
  });

  it("a day rate that is a whole working day at the tradie's own rate is kept", () => {
    const d = priceLabourLine(labour({ quantity: 2, unit: "day", unit_price: 600 }), ctx("two days"));
    expect(d).toMatchObject({ unit_price: 600, basis: "day_rate_from_hourly" });
  });

  it("an unstated, underivable day/lot price is left pending — never the hourly rate", () => {
    expect(priceLabourLine(labour({ quantity: 2, unit: "day", unit_price: 555 }), ctx("two days"))).toMatchObject({
      unit_price: 0,
      is_missing_price: true,
      basis: "pending",
    });
    expect(priceLabourLine(labour({ quantity: 1, unit: "lot", unit_price: 1800 }), ctx("fixed price job"))).toMatchObject({
      unit_price: 0,
      is_missing_price: true,
    });
  });

  it("with no profile rate, an hour line is pending rather than $0-and-silent", () => {
    const d = priceLabourLine(labour({ quantity: 4 }), { hourlyRate: 0, statedAmounts: [] });
    expect(d.is_missing_price).toBe(true);
  });
});

const lib = (o: Partial<LibraryMaterial>): LibraryMaterial => ({
  id: "lib-1",
  name: "H3.2 Joist 140x45",
  unit: "m",
  default_unit_price: 11.2,
  supplier: null,
  supplier_url: null,
  notes: null,
  usage_count: 0,
  is_ai_estimated: false,
  last_used_at: null,
  ...o,
});

describe("applyPricingPolicy", () => {
  const ctx = { hourlyRate: 75, statedAmounts: [600], library: [lib({})] };

  it("a model-spoofed 'user_library' $999 price does NOT survive", () => {
    const items: QuoteLineItem[] = [
      {
        type: "material", description: "Mystery product", quantity: 1, unit: "each",
        unit_price: 999, line_total: 999, library_id: null,
        price_source: "user_library", price_confidence: "high",
      },
      {
        type: "material", description: "H3.2 joist 140x45", quantity: 10, unit: "m",
        unit_price: 999, line_total: 9990, library_id: "lib-1", // real link, wrong price
        price_source: "user_library", price_confidence: "high",
      },
    ];
    applyPricingPolicy(items, ctx);
    for (const it of items) {
      expect(it.unit_price).toBe(0);
      expect(it.line_total).toBe(0);
      expect(it.is_missing_price).toBe(true);
      expect(it.price_source).toBe("missing_price");
      expect(it.price_confidence).toBeUndefined();
    }
  });

  it("a genuine, re-verified library price survives", () => {
    const items: QuoteLineItem[] = [
      {
        type: "material", description: "H3.2 joist 140x45", quantity: 10, unit: "m",
        unit_price: 11.2, line_total: 0, library_id: "lib-1",
        price_source: "user_library", price_confidence: "high",
      },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 11.2, line_total: 112, is_missing_price: false });
  });

  it("AI 'other' prices go pending; labour follows priceLabourLine", () => {
    const items: QuoteLineItem[] = [
      { type: "other", description: "Skip bin", quantity: 1, unit: "each", unit_price: 450, line_total: 450 },
      labour({ quantity: 2, unit: "day", unit_price: 600 }),
      labour({ quantity: 6, unit: "hour", unit_price: 120 }),
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 0, is_missing_price: true });
    expect(items[1]).toMatchObject({ unit_price: 600, line_total: 1200, is_missing_price: false });
    expect(items[2]).toMatchObject({ unit_price: 75, line_total: 450, is_missing_price: false });
  });
});

describe("applyPricingPolicy — a price the tradie SAYS for this job is theirs", () => {
  const said =
    "Supply and fix 14 sheets of 10mm GIB at $31.50 a sheet and 2 boxes of GIB screws for $70. $150 to deliver. One day labour at $650.";
  const ctx = { hourlyRate: 75, statedAmounts: extractStatedAmounts(said), library: [lib({})] };

  it("matchesStatedAmount reads the unit price or the line total", () => {
    const stated = extractStatedAmounts(said);
    expect(matchesStatedAmount(31.5, 14, stated)).toBe(true);
    expect(matchesStatedAmount(35, 2, stated)).toBe(true); // 2 × $35 = the $70 said
    expect(matchesStatedAmount(28.5, 14, stated)).toBe(false);
    expect(matchesStatedAmount(0, 1, stated)).toBe(false);
    expect(matchesStatedAmount(31.5, 14, [])).toBe(false);
  });

  it("GIB at $31.50 a sheet keeps $31.50 — 14 sheets = $441.00", () => {
    const items: QuoteLineItem[] = [
      { type: "material", description: "GIB Standard 10mm", quantity: 14, unit: "sheet", unit_price: 31.5, line_total: 0 },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 31.5, line_total: 441, is_missing_price: false, is_ai_estimated: false });
    expect(items[0].price_source).toBeUndefined();
  });

  it("a stated line total counts too (2 boxes for $70 → $35 a box)", () => {
    const items: QuoteLineItem[] = [
      { type: "material", description: "GIB screws", quantity: 2, unit: "box", unit_price: 35, line_total: 0 },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 35, line_total: 70, is_missing_price: false });
  });

  it("a stated fee on an 'other' line is kept ($150 to deliver)", () => {
    const items: QuoteLineItem[] = [
      { type: "other", description: "Delivery", quantity: 1, unit: "each", unit_price: 150, line_total: 150 },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 150, line_total: 150, is_missing_price: false });
  });

  it("beats a different library price and drops the library tag", () => {
    const items: QuoteLineItem[] = [
      {
        type: "material", description: "H3.2 joist 140x45", quantity: 10, unit: "m",
        unit_price: 31.5, line_total: 0, library_id: "lib-1", // library says $11.20
        price_source: "user_library", price_confidence: "high",
      },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 31.5, line_total: 315, is_missing_price: false, library_id: "lib-1" });
    expect(items[0].price_source).toBeUndefined();
    expect(items[0].price_confidence).toBeUndefined();
  });

  it("a stated price that IS the library price keeps the library tag", () => {
    const items: QuoteLineItem[] = [
      {
        type: "material", description: "H3.2 joist 140x45", quantity: 10, unit: "m",
        unit_price: 11.2, line_total: 0, library_id: "lib-1",
        price_source: "user_library", price_confidence: "high",
      },
    ];
    applyPricingPolicy(items, { ...ctx, statedAmounts: [11.2] });
    expect(items[0]).toMatchObject({ unit_price: 11.2, line_total: 112, price_source: "user_library", price_confidence: "high" });
  });

  it("an unstated AI material price is still wiped", () => {
    const items: QuoteLineItem[] = [
      { type: "material", description: "Stopping compound", quantity: 1, unit: "bag", unit_price: 42, line_total: 42 },
    ];
    applyPricingPolicy(items, ctx);
    expect(items[0]).toMatchObject({ unit_price: 0, line_total: 0, is_missing_price: true, price_source: "missing_price" });
  });

  it("with no stated amounts (the customer's own words) nothing is kept", () => {
    const items: QuoteLineItem[] = [
      { type: "material", description: "GIB Standard 10mm", quantity: 14, unit: "sheet", unit_price: 31.5, line_total: 441 },
      { type: "other", description: "Delivery", quantity: 1, unit: "each", unit_price: 150, line_total: 150 },
    ];
    applyPricingPolicy(items, { ...ctx, statedAmounts: [] });
    for (const it of items) expect(it).toMatchObject({ unit_price: 0, is_missing_price: true });
  });
});
