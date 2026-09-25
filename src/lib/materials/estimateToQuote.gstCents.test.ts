import { describe, expect, it } from "vitest";
import { buildScanQuote, type ScanQuoteLine } from "./scanToQuote";
import { exGstSubtotalForTotal } from "./estimateToQuote";
import { assessQuoteTakeoffSafety } from "../quote-validation";
import { computeQuoteTotals, round2 } from "../quote-defaults";

// Audit item 8 — a GST-inclusive supplier quote is mirrored as ex-GST lines
// plus GST on top. Each printed inclusive line total used to be converted and
// rounded on its own (10 ÷ 1.15 = 8.6957 → 8.70), so with 5+ lines the cents
// piled up: five $10 lines came to $50.03, ten to $100.05, twenty-five $9.99
// lines to $249.84 instead of $249.75. The cents are now allocated across the
// lines (largest remainder) so the ex-GST lines + GST add back to the printed
// inclusive total EXACTLY, and each line that absorbed a rounding cent is
// named.

const NZ = { currency: "NZD", taxLabel: "GST", taxRate: 15 };

function build(lines: ScanQuoteLine[]) {
  const printed = round2(lines.reduce((s, l) => s + (l.line_total ?? 0), 0));
  const r = buildScanQuote(lines, { supplier: "ITM", gstInclusive: true, subtotal: printed, total: printed }, NZ);
  if (!r.ok) throw new Error(r.error);
  return { q: r.value, printed };
}

const same = (n: number, price: number): ScanQuoteLine[] =>
  Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, unit: "each", quantity: 1, price, line_total: price }));

const absorbed = (lines: Array<{ description: string; validation_flags?: string[] }>) =>
  lines.filter((l) => l.validation_flags?.includes("gst_rounding_cent")).map((l) => l.description);

describe("GST-inclusive mirror adds back to the printed total to the cent", () => {
  it("5 × $10 incl: $50.00 exactly (was $50.03)", () => {
    const { q } = build(same(5, 10));
    expect(q.quoteData.total).toBe(50);
    expect(q.quoteData.subtotal_before_tax).toBe(43.48);
    expect(q.quoteData.tax_amount).toBe(6.52);
    expect(q.lineItems.map((l) => l.line_total)).toEqual([8.7, 8.7, 8.7, 8.69, 8.69]);
    expect(absorbed(q.lineItems)).toEqual(["Item 4", "Item 5"]);
    expect(q.quoteData.notes.join(" ")).toMatch(
      /To match the supplier's printed total of \$50\.00 to the cent, 2 lines took a 1¢ rounding difference ex-GST: Item 4, Item 5\./,
    );
  });

  it("10 × $10 incl: $100.00 exactly (was $100.05)", () => {
    const { q } = build(same(10, 10));
    expect(q.quoteData.total).toBe(100);
    expect(absorbed(q.lineItems)).toHaveLength(4);
  });

  it("25 × $9.99 incl: $249.75 exactly (was $249.84)", () => {
    const { q } = build(same(25, 9.99));
    expect(q.quoteData.total).toBe(249.75);
    expect(q.quoteData.subtotal_before_tax).toBe(217.17);
    expect(absorbed(q.lineItems)).toHaveLength(8);
  });

  it("the mirrored lines still satisfy the send gate's supplier checks and quantity × price", () => {
    const { q } = build(same(25, 9.99));
    const reasons = assessQuoteTakeoffSafety(q.quoteData).block_reasons;
    expect(reasons.filter((r) => /supplier|line total/i.test(r))).toEqual([]);
    for (const l of q.lineItems) {
      expect(round2(l.quantity * l.unit_price)).toBe(l.line_total);
      expect(l.source_line_total).toBe(l.line_total);
    }
  });

  it("a total no ex-GST subtotal can reach (100 × $9.99 = $999.00) is 1¢ off and says so", () => {
    const { q } = build([{ name: "Hinge", unit: "each", quantity: 100, price: 9.99, line_total: 999 }]);
    expect(Math.abs(round2(q.quoteData.total - 999))).toBe(0.01);
    expect(q.quoteData.notes.join(" ")).toMatch(
      /The supplier's printed total of \$999\.00 can't be matched to the cent with 15% GST added to an ex-GST subtotal — the nearest is \$999\.0[01]\./,
    );
  });

  it("$1,231.30 (golden M02) is unreachable: the total steps 123,129 c → 123,131 c between S = 107,069 and 107,070 c", () => {
    // The quote's own total for an ex-GST subtotal S (cents): S + 15 % GST, half-up.
    const totalFor = (s: number) =>
      Math.round(computeQuoteTotals([{ type: "material", quantity: 1, unit_price: s / 100 }], 0, 15).total * 100);
    expect(totalFor(107_069)).toBe(123_129); // 16,060.35 → 16,060
    expect(totalFor(107_070)).toBe(123_131); // 16,060.50 → 16,061 (half-up)
    // T never falls and steps by 1 or 2 c, so nothing either side reaches it.
    let prev = totalFor(106_000);
    for (let s = 106_001; s <= 108_000; s++) {
      const t = totalFor(s);
      expect(t - prev === 1 || t - prev === 2).toBe(true);
      expect(t).not.toBe(123_130);
      prev = t;
    }
    // Nearest reachable: both neighbours are 1 c off; the subtotal nearest
    // 123,130 ÷ 1.15 = 107,069.57 wins → $1,070.70 ex, $1,231.31 total.
    expect(exGstSubtotalForTotal(123_130, 0.15)).toEqual({ cents: 107_070, exact: false });
  });

  it("property: over 300 mixed carts (5–25 lines, discounts included) the total equals the printed total whenever any ex-GST subtotal can reach it, else is within 1¢", () => {
    let seed = 20260925;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const reachable = (totalCents: number) => {
      const base = Math.floor(totalCents / 1.15);
      for (let s = base - 3; s <= base + 3; s++) {
        const t = computeQuoteTotals([{ type: "material", quantity: 1, unit_price: s / 100 }], 0, 15).total;
        if (Math.round(t * 100) === totalCents) return true;
      }
      return false;
    };
    let exactCarts = 0;
    for (let cart = 0; cart < 300; cart++) {
      const n = 5 + Math.floor(rand() * 21);
      const lines: ScanQuoteLine[] = Array.from({ length: n }, (_, i) => {
        const quantity = 1 + Math.floor(rand() * 20);
        const price = round2(0.5 + rand() * 120);
        return { name: `L${i}`, unit: "each", quantity, price, line_total: round2(quantity * price) };
      });
      if (cart % 7 === 0) lines.push({ name: "Trade discount", unit: "each", quantity: 1, price: -12.5, line_total: -12.5 });
      const { q, printed } = build(lines);
      const printedCents = Math.round(printed * 100);
      if (reachable(printedCents)) {
        expect(q.quoteData.total).toBe(printed);
        exactCarts++;
      } else {
        expect(Math.abs(round2(q.quoteData.total - printed))).toBe(0.01);
      }
      // Every line still equals quantity × unit price.
      for (const l of q.lineItems) expect(round2(l.quantity * l.unit_price)).toBe(l.line_total);
    }
    expect(exactCarts).toBeGreaterThan(200);
  });
});
