import { describe, expect, it } from "vitest";
import type { LibraryMaterial, QuoteLineItem } from "@/lib/quote-types";
import {
  applyPricingPolicy,
  extractStatedAmounts,
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
