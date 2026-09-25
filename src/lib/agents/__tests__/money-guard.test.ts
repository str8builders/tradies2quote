import { describe, expect, it } from "vitest";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { inventedAmounts, inventedFigureError, moneyAmountsIn, publicQuoteFigures } from "../money-guard";

const QUOTE = {
  line_items: [
    { description: "Kwila decking", quantity: 1, unit: "lot", unit_price: 3317.16, line_total: 3317.16, type: "material" },
    { description: "Labour", quantity: 48, unit: "hour", unit_price: 75, line_total: 3600, type: "labour" },
  ],
  materials_subtotal: 5843.81,
  labour_subtotal: 3600,
  markup_amount: 1168.76,
  subtotal_before_tax: 10612.57,
  tax_amount: 1591.89,
  total: 12204.46,
  terms: "30% deposit on acceptance, balance on completion.",
} as unknown as PublicQuotePayload;

describe("money guard — only figures on the quote or from the customer", () => {
  it("reads $, NZ$, A$, £, NZD, k and 'dollars' amounts; not %, quantities or sizes", () => {
    expect(moneyAmountsIn("$12,204.46, NZ$9,800, A$500, £1,250, $11k, NZD 500, 600 dollars")).toEqual([
      12204.46, 9800, 500, 1250, 11000, 500, 600,
    ]);
    expect(moneyAmountsIn("15% GST on 184.8 m of 140x19 decking, 20 piles at 450 centres")).toEqual([]);
  });

  it("allows every printed figure and the split for each % in the terms", () => {
    const figures = publicQuoteFigures(QUOTE);
    expect(
      inventedAmounts("Total $12,204.46 with $1,591.89 GST; deposit $3,661.34, balance $8,543.12; labour $3,600.", figures),
    ).toEqual([]);
  });

  it("catches a worked-out gap, discount or new total", () => {
    const allowed = [...publicQuoteFigures(QUOTE), ...moneyAmountsIn("Can you do it for $11k?")];
    expect(inventedAmounts("Not much fat to shave $1,200 off, but $11,000 isn't possible.", allowed)).toEqual([1200]);
    expect(inventedAmounts("With pine it'd be about $10,950.", allowed)).toEqual([10950]);
  });

  it("the rewrite request names the figure", () => {
    expect(inventedFigureError([1200], "The reply")).toMatch(/^The reply states \$1,200, which is not on the quote/);
  });
});
