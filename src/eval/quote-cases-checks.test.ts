/**
 * Always-on tests for the quote eval's exact-number checks (statedLine) and
 * the new exact cases, so a broken check can't hide behind the opt-in gate.
 */
import { describe, expect, it } from "vitest";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { QUOTE_EVAL_CASES, statedLine } from "./quote-cases";

const quote = (lines: Array<Partial<QuoteLineItem>>): QuoteData =>
  ({
    line_items: lines.map((l) => ({ type: "material", description: "", quantity: 0, unit: "each", unit_price: 0, line_total: 0, ...l })),
  }) as unknown as QuoteData;

describe("statedLine — exact to the cent", () => {
  const check = statedLine("day rate", "labour", /./, 2, 560);

  it("passes 2 days × $560 = $1,120.00", () => {
    expect(check.hard).toBe(true);
    expect(check.pass(quote([{ type: "labour", description: "Labour", quantity: 2, unit: "day", unit_price: 560, line_total: 1120 }]))).toBe(true);
  });

  it("fails the same money re-expressed as 16 h × $70 (production would reprice it)", () => {
    expect(check.pass(quote([{ type: "labour", description: "Labour", quantity: 16, unit: "hour", unit_price: 70, line_total: 1120 }]))).toBe(false);
  });

  it("fails a price one cent out, or a line_total that isn't qty × price", () => {
    expect(check.pass(quote([{ type: "labour", description: "Labour", quantity: 2, unit: "day", unit_price: 559.99, line_total: 1119.98 }]))).toBe(false);
    expect(check.pass(quote([{ type: "labour", description: "Labour", quantity: 2, unit: "day", unit_price: 560, line_total: 1344 }]))).toBe(false);
  });

  it("the GIB check wants the stated $31.50, not the library's $28.50, and ignores the screw line", () => {
    const gib = QUOTE_EVAL_CASES.find((c) => c.id === "exact-stated-price-beats-library")!.checks[0];
    expect(gib.pass(quote([{ description: "GIB Standard 10mm 2400x1200", quantity: 14, unit_price: 31.5, line_total: 441 }]))).toBe(true);
    expect(gib.pass(quote([{ description: "GIB Standard 10mm 2400x1200", quantity: 14, unit_price: 28.5, line_total: 399 }]))).toBe(false);
    expect(gib.pass(quote([{ description: "GIB screws", quantity: 14, unit_price: 31.5, line_total: 441 }]))).toBe(false);
  });

  it("every exact case is made of hard checks", () => {
    const exact = QUOTE_EVAL_CASES.filter((c) => c.id.startsWith("exact-"));
    expect(exact.length).toBeGreaterThanOrEqual(4);
    for (const c of exact) expect(c.checks.every((k) => k.hard), c.id).toBe(true);
  });
});
