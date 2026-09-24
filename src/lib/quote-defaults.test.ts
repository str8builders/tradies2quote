import { describe, expect, it } from "vitest";
import {
  MAX_MARKUP_PCT,
  MAX_TAX_RATE,
  addGst,
  clampMarkupPct,
  clampTaxRate,
  computeQuoteTotals,
  formatCurrency,
  gstInclusiveBreakdown,
  moneyEquals,
  resolveTaxLabel,
  resolveTaxRate,
  round2,
  splitDisplaySubtotals,
  taxDefaultsFor,
} from "./quote-defaults";

// ─── round2 ──────────────────────────────────────────────────────────────
describe("round2", () => {
  it("rounds to 2 decimal places (half-up)", () => {
    expect(round2(49.975)).toBe(49.98);
    expect(round2(49.974)).toBe(49.97);
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
  });

  it("coerces non-finite input to 0", () => {
    expect(round2(Number.NaN)).toBe(0);
    expect(round2(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

// ─── GST: add on top (ex → incl) ─────────────────────────────────────────
describe("addGst — GST applied on top of an ex-GST amount", () => {
  it("$3,380 + 15% GST = $3,887 (GST $507)", () => {
    const b = addGst(3380, 15);
    expect(b.exclusive).toBe(3380);
    expect(b.gst).toBe(507);
    expect(b.inclusive).toBe(3887);
    expect(b.rate).toBe(15);
  });

  it("zero amount → all zero", () => {
    expect(addGst(0, 15)).toEqual({
      exclusive: 0,
      gst: 0,
      inclusive: 0,
      rate: 15,
    });
  });

  it("defaults to the NZ 15% rate", () => {
    expect(addGst(100).inclusive).toBe(115);
  });

  it("rounds the GST portion to cents", () => {
    // 199.99 * 0.15 = 29.9985 → 30.00
    const b = addGst(199.99, 15);
    expect(b.gst).toBe(30);
    expect(b.inclusive).toBe(229.99);
  });
});

// ─── GST: decompose an inclusive amount (incl → ex) ──────────────────────
describe("gstInclusiveBreakdown — GST extracted from an inclusive amount", () => {
  it("$3,887 incl. GST → ex $3,380.00, GST $507.00 (exact inverse of 3380+15%)", () => {
    // NOTE: the brief listed ex $3,380.87 / GST $506.13 for this case, but that
    // is arithmetically wrong at 15% — 3380.87 + 506.13 implies a ~14.97% rate.
    // $3,887 / 1.15 = $3,380.00 exactly, GST $507.00. The helper is correct.
    const b = gstInclusiveBreakdown(3887, 15);
    expect(b.inclusive).toBe(3887);
    expect(b.exclusive).toBe(3380);
    expect(b.gst).toBe(507);
  });

  it("messy inclusive amount rounds cleanly: $100 incl. → ex $86.96, GST $13.04", () => {
    const b = gstInclusiveBreakdown(100, 15);
    expect(b.exclusive).toBe(86.96); // 100 / 1.15 = 86.9565…
    expect(b.gst).toBe(13.04);
    expect(round2(b.exclusive + b.gst)).toBe(100);
  });

  it("the ex + GST parts always re-sum to the inclusive total", () => {
    const b = gstInclusiveBreakdown(3887, 15);
    expect(round2(b.exclusive + b.gst)).toBe(b.inclusive);
  });

  it("zero amount → all zero", () => {
    const b = gstInclusiveBreakdown(0, 15);
    expect(b).toEqual({ inclusive: 0, exclusive: 0, gst: 0, rate: 15 });
  });
});

// ─── computeQuoteTotals — the single source of truth ─────────────────────
describe("computeQuoteTotals", () => {
  it("zero / empty line items → all totals zero", () => {
    const t = computeQuoteTotals([], 20, 15);
    expect(t).toEqual({
      materials_subtotal: 0,
      labour_subtotal: 0,
      markup_amount: 0,
      subtotal_before_tax: 0,
      tax_amount: 0,
      total: 0,
    });
  });

  it("$3,380 ex-GST single line, no markup, 15% GST → total $3,887", () => {
    const t = computeQuoteTotals(
      [{ type: "material", quantity: 1, unit_price: 3380 }],
      0,
      15,
    );
    expect(t.materials_subtotal).toBe(3380);
    expect(t.markup_amount).toBe(0);
    expect(t.subtotal_before_tax).toBe(3380);
    expect(t.tax_amount).toBe(507);
    expect(t.total).toBe(3887);
  });

  it("materials + labour + markup + GST end-to-end", () => {
    // materials 1000, labour 500, markup 20% (materials only), GST 15%
    const t = computeQuoteTotals(
      [
        { type: "material", quantity: 1, unit_price: 1000 },
        { type: "labour", quantity: 1, unit_price: 500 },
      ],
      20,
      15,
    );
    expect(t.materials_subtotal).toBe(1000);
    expect(t.labour_subtotal).toBe(500);
    expect(t.markup_amount).toBe(200); // 20% of materials only
    expect(t.subtotal_before_tax).toBe(1700); // 1000 + 200 + 500
    expect(t.tax_amount).toBe(255); // 15% of 1700
    expect(t.total).toBe(1955); // 1700 + 255
  });

  it("markup applies to materials + other, NOT labour", () => {
    const t = computeQuoteTotals(
      [
        { type: "material", quantity: 1, unit_price: 100 },
        { type: "other", quantity: 1, unit_price: 100 },
        { type: "labour", quantity: 1, unit_price: 100 },
      ],
      10,
      0,
    );
    // materials_subtotal bundles material + other = 200; markup = 10% of 200 = 20
    expect(t.materials_subtotal).toBe(200);
    expect(t.labour_subtotal).toBe(100);
    expect(t.markup_amount).toBe(20);
    expect(t.subtotal_before_tax).toBe(320);
  });

  it("uses SUM-OF-ROUNDED so visible lines tie out to the subtotal", () => {
    // 2.5 * 19.99 = 49.975 exactly → each visible line rounds half-up to
    // 49.98 (the double 49.97499… used to show 49.97). Sum-of-rounded =
    // 49.98 + 49.98 = 99.96 (what the line items add up to). Round-of-sum
    // would be round2(99.95) = 99.95 — the old mismatch bug.
    const t = computeQuoteTotals(
      [
        { type: "material", quantity: 2.5, unit_price: 19.99 },
        { type: "material", quantity: 2.5, unit_price: 19.99 },
      ],
      0,
      0,
    );
    expect(round2(2.5 * 19.99)).toBe(49.98); // each line as shown
    expect(t.materials_subtotal).toBe(99.96); // 49.98 + 49.98, ties out to lines
    expect(t.total).toBe(99.96);
    expect(round2(2.5 * 19.99 + 2.5 * 19.99)).toBe(99.95); // round-of-sum differs
  });

  it("decimal-quantity rounding stays at cents", () => {
    // 3 @ 33.333 = 99.999 → line rounds to 100.00
    const t = computeQuoteTotals(
      [{ type: "material", quantity: 3, unit_price: 33.333 }],
      0,
      15,
    );
    expect(t.materials_subtotal).toBe(100);
    expect(t.tax_amount).toBe(15);
    expect(t.total).toBe(115);
  });

  it("coerces missing / non-numeric quantities and prices to 0", () => {
    const t = computeQuoteTotals(
      [
        // @ts-expect-error — intentionally malformed input
        { type: "material", quantity: "abc", unit_price: 50 },
        { type: "material", quantity: 2, unit_price: undefined as unknown as number },
      ],
      20,
      15,
    );
    expect(t.total).toBe(0);
  });

  it("quote totals match a fresh add-GST of the same subtotal (review = invoice)", () => {
    const t = computeQuoteTotals(
      [
        { type: "material", quantity: 4, unit_price: 250 },
        { type: "labour", quantity: 10, unit_price: 75 },
      ],
      15,
      15,
    );
    // Independently re-derive incl. total from the ex-GST subtotal.
    const re = addGst(t.subtotal_before_tax, 15);
    expect(re.gst).toBe(t.tax_amount);
    expect(re.inclusive).toBe(t.total);
  });
});

// ─── splitDisplaySubtotals ───────────────────────────────────────────────
describe("splitDisplaySubtotals", () => {
  it("splits material vs other and ignores labour", () => {
    const split = splitDisplaySubtotals([
      { type: "material", line_total: 100 },
      { type: "other", line_total: 40 },
      { type: "labour", line_total: 500 },
    ]);
    expect(split).toEqual({ materials: 100, other: 40 });
  });

  it("falls back to quantity * unit_price when line_total is absent", () => {
    const split = splitDisplaySubtotals([
      { type: "material", quantity: 3, unit_price: 10 },
    ]);
    expect(split.materials).toBe(30);
  });
});

// ─── formatCurrency ──────────────────────────────────────────────────────
describe("formatCurrency", () => {
  it("formats NZD with two decimals", () => {
    expect(formatCurrency(3887, "NZD")).toBe("$3,887.00");
    expect(formatCurrency(3380.87, "NZD")).toBe("$3,380.87");
  });

  it("handles non-finite input as $0.00", () => {
    expect(formatCurrency(Number.NaN, "NZD")).toBe("$0.00");
  });
});

// ─── moneyEquals ─────────────────────────────────────────────────────────
describe("moneyEquals", () => {
  it("treats sub-cent differences as equal", () => {
    expect(moneyEquals(100.004, 100)).toBe(true);
    expect(moneyEquals(100.02, 100)).toBe(false);
  });
});

// ─── clampMarkupPct / clampTaxRate ───────────────────────────────────────
// Typo guards on the two user-editable percentages that feed totals. A
// slipped digit (155% GST) must never silently flow into a customer total.
describe("rate clamps", () => {
  it("passes legitimate values through unchanged", () => {
    expect(clampMarkupPct(20)).toBe(20);
    expect(clampMarkupPct(0)).toBe(0);
    expect(clampTaxRate(15)).toBe(15);
    expect(clampTaxRate(0)).toBe(0);
  });

  it("clamps slipped digits to the hard ceilings", () => {
    expect(clampMarkupPct(900)).toBe(MAX_MARKUP_PCT);
    expect(clampTaxRate(155)).toBe(MAX_TAX_RATE);
  });

  it("treats negative, NaN, Infinity and junk strings as 0", () => {
    expect(clampMarkupPct(-20)).toBe(0);
    expect(clampMarkupPct(Number.NaN)).toBe(0);
    expect(clampTaxRate(Number.POSITIVE_INFINITY)).toBe(0); // non-finite fails closed
    expect(clampTaxRate("garbage")).toBe(0);
    expect(clampMarkupPct(undefined)).toBe(0);
    expect(clampTaxRate(null)).toBe(0);
  });
});

// ─── computeQuoteTotals: hostile inputs ──────────────────────────────────
describe("computeQuoteTotals hostile inputs", () => {
  it("non-finite quantities/prices contribute 0, never NaN totals", () => {
    const t = computeQuoteTotals(
      [
        { type: "material", quantity: Number.NaN, unit_price: 100 },
        { type: "material", quantity: 2, unit_price: Number.POSITIVE_INFINITY },
        { type: "labour", quantity: 3, unit_price: 90 },
      ],
      20,
      15,
    );
    for (const v of Object.values(t)) expect(Number.isFinite(v)).toBe(true);
    expect(t.materials_subtotal).toBe(0);
    expect(t.labour_subtotal).toBe(270);
  });

  it("string-typed numbers (malformed quote_data) coerce instead of poisoning", () => {
    const t = computeQuoteTotals(
      [
        {
          type: "material",
          quantity: "3" as unknown as number,
          unit_price: "10.50" as unknown as number,
        },
      ],
      0,
      15,
    );
    expect(t.materials_subtotal).toBe(31.5);
    expect(t.total).toBe(round2(31.5 * 1.15));
  });

  it("multi-line rounding cascade: visible lines always sum to the subtotal", () => {
    // 10 lines of 2.5 × $19.999 — each line shows $50.00 (rounded), so the
    // subtotal must be 10 × 50.00, not round(10 × 49.9975).
    const lines = Array.from({ length: 10 }, () => ({
      type: "material",
      quantity: 2.5,
      unit_price: 19.999,
    }));
    const t = computeQuoteTotals(lines, 0, 15);
    const visibleSum = lines.reduce(
      (s, l) => s + round2(l.quantity * l.unit_price),
      0,
    );
    expect(t.materials_subtotal).toBe(round2(visibleSum));
    expect(t.materials_subtotal).toBe(500); // sum-of-rounded, not 499.98
  });

  it(".005 midpoint lines round half-up consistently", () => {
    const t = computeQuoteTotals(
      [{ type: "material", quantity: 1, unit_price: 10.005 }],
      0,
      0,
    );
    expect(t.materials_subtotal).toBe(10.01);
    expect(t.total).toBe(10.01);
  });
});

// ─── round2: exact half-up (audit 2026-09-24, item 8) ────────────────────
// Plain Math.round(n * 100) / 100 rounded a half-cent DOWN whenever the
// double sat a hair below it. The shared helper must be exact half-up.

/** Exact decimal half-up reference: "7.125" × "19.999" → cents, via BigInt. */
function refLineCents(qty: string, price: string): number {
  const scale = (v: string) => {
    const [i, f = ""] = v.split(".");
    return BigInt(i + f.padEnd(3, "0")); // value × 1000, exact
  };
  const product = scale(qty) * scale(price); // value × 1e6
  return Number((product + BigInt(5000)) / BigInt(10000)); // → cents, half-up
}

describe("round2 — exact half-up", () => {
  it("15% GST on $1.50 is $0.23 (0.225 rounds up, not down)", () => {
    expect(round2(1.5 * 0.15)).toBe(0.23);
    const t = computeQuoteTotals([{ type: "material", quantity: 1, unit_price: 1.5 }], 0, 15);
    expect(t.tax_amount).toBe(0.23);
    expect(t.total).toBe(1.73);
  });

  it("1 × $1.005 is $1.01 on every surface that rounds a line", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(1 * 1.005)).toBe(1.01);
    const t = computeQuoteTotals([{ type: "material", quantity: 1, unit_price: 1.005 }], 0, 0);
    expect(t.materials_subtotal).toBe(1.01);
    expect(splitDisplaySubtotals([{ type: "material", quantity: 1, unit_price: 1.005 }]).materials).toBe(1.01);
    expect(addGst(1.005, 0).exclusive).toBe(1.01);
  });

  it("rounds negatives symmetrically (half away from zero) and zero stays 0", () => {
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(-0.025)).toBe(-0.03);
    expect(Object.is(round2(0), 0)).toBe(true);
    expect(Object.is(round2(-0), 0)).toBe(true);
  });

  it("sweep: every half-cent midpoint up to $2,000 rounds UP", () => {
    const wrong: number[] = [];
    for (let k = 0; k < 200_000; k++) {
      const midpoint = (2 * k + 1) / 200; // k.5 cents
      if (round2(midpoint) !== (k + 1) / 100) wrong.push(k);
    }
    expect(wrong).toEqual([]);
  });

  it("sweep: qty × price lines match an exact decimal half-up reference", () => {
    const quantities = ["0.25", "1", "1.5", "2.5", "3", "7.125", "12.75"];
    const wrong: string[] = [];
    for (const q of quantities) {
      for (let milli = 1; milli <= 20_000; milli++) {
        const price = (milli / 1000).toFixed(3);
        const expected = refLineCents(q, price) / 100;
        if (round2(Number(q) * Number(price)) !== expected) {
          wrong.push(`${q} × ${price}`);
        }
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("sweep: tax on whole-cent subtotals matches exact half-up at 15/10/20/12.5%", () => {
    const wrong: string[] = [];
    for (const rate of [15, 10, 20, 12.5]) {
      for (let cents = 0; cents <= 50_000; cents++) {
        const subtotal = cents / 100;
        // exact: cents × rate / 100 → cents, half-up (rate has ≤1 decimal)
        const exactTenths = BigInt(cents) * BigInt(Math.round(rate * 10)); // cents × rate × 10
        const expected = Number((exactTenths + BigInt(500)) / BigInt(1000)) / 100;
        const t = computeQuoteTotals([{ type: "labour", quantity: 1, unit_price: subtotal }], 0, rate);
        if (t.tax_amount !== expected) wrong.push(`${subtotal} @ ${rate}%`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });
});

// ─── Tax defaults by country (audit 2026-09-24, item 9) ──────────────────
describe("tax label / rate defaults by business country", () => {
  it("defaults: NZ GST 15, AU GST 10, UK VAT 20, US Tax 0, CA Tax 5", () => {
    expect(taxDefaultsFor("NZ")).toEqual({ tax_label: "GST", tax_rate: 15 });
    expect(taxDefaultsFor("AU")).toEqual({ tax_label: "GST", tax_rate: 10 });
    expect(taxDefaultsFor("UK")).toEqual({ tax_label: "VAT", tax_rate: 20 });
    expect(taxDefaultsFor("GB")).toEqual({ tax_label: "VAT", tax_rate: 20 });
    expect(taxDefaultsFor("US")).toEqual({ tax_label: "Tax", tax_rate: 0 });
    expect(taxDefaultsFor("CA")).toEqual({ tax_label: "Tax", tax_rate: 5 });
  });

  it("falls back to the currency's country, then NZ", () => {
    expect(taxDefaultsFor(null, "GBP").tax_label).toBe("VAT");
    expect(taxDefaultsFor("", "CAD").tax_label).toBe("Tax");
    expect(taxDefaultsFor(undefined, undefined)).toEqual({ tax_label: "GST", tax_rate: 15 });
  });

  it("a UK/US/CA profile never prints the column-default 'GST'", () => {
    expect(resolveTaxLabel("GST", "UK", "GBP")).toBe("VAT");
    expect(resolveTaxLabel("GST", "US", "USD")).toBe("Tax");
    expect(resolveTaxLabel("GST", "CA", "CAD")).toBe("Tax");
    expect(resolveTaxLabel(null, "UK")).toBe("VAT");
    expect(resolveTaxLabel("  ", "AU")).toBe("GST");
    expect(resolveTaxLabel("VAT", "NZ")).toBe("GST");
    expect(resolveTaxLabel("GST", "NZ")).toBe("GST");
  });

  it("keeps a label the tradie set themselves", () => {
    expect(resolveTaxLabel("HST", "CA")).toBe("HST");
    expect(resolveTaxLabel("Sales tax", "US")).toBe("Sales tax");
  });

  it("a blank rate uses the country default — never a silent NZ 15%", () => {
    expect(resolveTaxRate(null, "UK")).toBe(20);
    expect(resolveTaxRate(undefined, "US")).toBe(0);
    expect(resolveTaxRate("", "AU")).toBe(10);
    expect(resolveTaxRate("junk", "CA")).toBe(5);
    expect(resolveTaxRate(null, null, "GBP")).toBe(20);
  });

  it("an explicit rate (including 0) is kept, still clamped", () => {
    expect(resolveTaxRate(12.5, "UK")).toBe(12.5);
    expect(resolveTaxRate(0, "UK")).toBe(0);
    expect(resolveTaxRate(155, "NZ")).toBe(MAX_TAX_RATE);
  });
});
