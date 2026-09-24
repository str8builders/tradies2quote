import { describe, expect, it } from "vitest";
import {
  assessExtraction,
  chooseBestExtraction,
  normaliseUnit,
  parseSupplierQuoteExtraction,
  toExGst,
  type ExtractedSupplierItem,
  type SupplierQuoteExtraction,
} from "./quoteExtraction";

describe("normaliseUnit", () => {
  it("maps common merchant spellings to canonical units", () => {
    expect(normaliseUnit("ea")).toBe("each");
    expect(normaliseUnit("EACH")).toBe("each");
    expect(normaliseUnit("m2")).toBe("m²");
    expect(normaliseUnit("sqm")).toBe("m²");
    expect(normaliseUnit("lm")).toBe("m");
    expect(normaliseUnit("LGTH")).toBe("length");
  });

  it("defaults blank/non-string to each, passes through unknowns", () => {
    expect(normaliseUnit("")).toBe("each");
    expect(normaliseUnit(null)).toBe("each");
    expect(normaliseUnit("widget")).toBe("widget");
  });
});

describe("parseSupplierQuoteExtraction", () => {
  it("rejects a non-object payload", () => {
    expect(parseSupplierQuoteExtraction(null).ok).toBe(false);
    expect(parseSupplierQuoteExtraction("nope").ok).toBe(false);
  });

  it("parses a clean ITM-style payload", () => {
    const r = parseSupplierQuoteExtraction({
      supplier: "ITM",
      currency: "NZD",
      gst_inclusive: false,
      items: [
        { name: "90x45 H1.2 SG8 Pine", unit: "length", price: 12.5, sku: "TIM9045", confidence: 0.9 },
        { name: "Stainless decking screws 65mm", unit: "box", price: 48, sku: null, confidence: 0.8 },
      ],
      notes: ["bottom row was smudged"],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.supplier).toBe("ITM");
    expect(r.value.items).toHaveLength(2);
    expect(r.value.items[0].name).toBe("90x45 H1.2 SG8 Pine");
    expect(r.value.notes).toContain("bottom row was smudged");
  });

  it("coerces '$1,234.50' price strings to numbers", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "Sheet ply", unit: "sheet", price: "$1,234.50" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0].price).toBe(1234.5);
  });

  it("keeps a priceless row but with price null", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "Custom flashing", unit: "each", price: "POA" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0].price).toBeNull();
  });

  it("drops rows with no name", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "", unit: "each", price: 5 }, { unit: "m", price: 3 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(0);
  });

  it("keeps a genuinely repeated row (same name + unit, e.g. two deliveries)", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "GIB 13mm 2.4x1.2", unit: "sheet", quantity: 10, price: 22, line_total: 220 },
        { name: "90x45 H1.2", unit: "length", quantity: 5, price: 12.4, line_total: 62 },
        { name: "gib 13mm 2.4x1.2", unit: "sheet", quantity: 4, price: 22, line_total: 88 },
      ],
      subtotal: 370,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Both GIB rows are real lines on the quote — dropping one lost $88.
    expect(r.value.items).toHaveLength(3);
    expect(r.value.items.map((i) => i.source_line_total)).toEqual([220, 62, 88]);
    expect(r.warnings).toEqual([]);
  });

  it("clamps confidence and defaults a missing one", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "A", unit: "each", price: 1, confidence: 5 },
        { name: "B", unit: "each", price: 1 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0].confidence).toBe(1);
    expect(r.value.items[1].confidence).toBe(0.6);
  });

  it("keeps a discount / credit line with its negative sign", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
        { name: "Trade discount", unit: "each", quantity: 1, price: -25, line_total: -25 },
        { name: "Trade discount", unit: "each", quantity: 1, price: -25, line_total: -25 },
      ],
      subtotal: 450,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(3);
    expect(r.value.items[1].price).toBe(-25);
    expect(r.value.items[1].source_line_total).toBe(-25);
    expect(r.value.items[2].price).toBe(-25);
  });

  it("normalises a negative-quantity credit to a positive quantity and a negative price", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "Return: 90x45 stud", unit: "length", quantity: -2, price: 12.4, line_total: -24.8 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0]).toMatchObject({ quantity: 2, price: -12.4, source_line_total: -24.8 });
  });

  it("keeps the unit price exactly as read — $0.125 × 1000 is $125, not $130", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ name: "Nails 90mm", unit: "each", quantity: 1000, price: 0.125, line_total: 125 }],
      subtotal: 125,
      total: 143.75,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items[0].price).toBe(0.125);
  });

  it("treats a non-boolean gst_inclusive as null", () => {
    const r = parseSupplierQuoteExtraction({ items: [], gst_inclusive: "yes" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.gst_inclusive).toBeNull();
  });
});

describe("toExGst", () => {
  it("strips GST when the price is inclusive", () => {
    expect(toExGst(115, true)).toBe(100);
  });
  it("leaves an exclusive price untouched", () => {
    expect(toExGst(100, false)).toBe(100);
  });
});

// ── #2 strict extraction + retry assessment ──────────────────────────────

function vitem(
  p: Partial<ExtractedSupplierItem> & Pick<ExtractedSupplierItem, "name">,
): ExtractedSupplierItem {
  return {
    name: p.name,
    unit: p.unit ?? "each",
    price: p.price ?? null,
    sku: p.sku ?? null,
    quantity: p.quantity ?? null,
    pieces: p.pieces ?? null,
    source_line_total: p.source_line_total ?? null,
    raw_text: p.raw_text ?? null,
    confidence: p.confidence ?? 0.9,
  };
}
function val(p: Partial<SupplierQuoteExtraction> = {}): SupplierQuoteExtraction {
  return {
    supplier: null,
    quote_number: null,
    currency: "NZD",
    gst_inclusive: false,
    items: [],
    subtotal: null,
    gst: null,
    total: null,
    notes: [],
    ...p,
  };
}

describe("parseSupplierQuoteExtraction — strict rows", () => {
  it("rejects a malformed (present-but-unreadable) price as a rowFailure, not a silent null", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "Garbled", unit: "each", price: "12.4O", line_total: "235.60" },
        { name: "Good", unit: "each", price: 10, line_total: 10 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items.map((i) => i.name)).toEqual(["Good"]);
    expect(r.rowFailures).toHaveLength(1);
    expect(r.rowFailures[0].reason).toMatch(/price/i);
  });

  it("keeps a row with an absent / POA price (intentional non-price), no failure", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "Custom flashing", unit: "each", price: "POA", line_total: null },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(1);
    expect(r.value.items[0].price).toBeNull();
    expect(r.rowFailures).toHaveLength(0);
  });

  it("records a no-name row as a visible rowFailure", () => {
    const r = parseSupplierQuoteExtraction({
      items: [{ unit: "m", price: 3 }, { name: "OK", price: 1 }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(1);
    expect(r.rowFailures.some((f) => /name/i.test(f.reason))).toBe(true);
  });

  it("keeps two identical rows and flags them visibly (never silently drops a line)", () => {
    const r = parseSupplierQuoteExtraction({
      items: [
        { name: "GIB 13mm", unit: "sheet", quantity: 2, price: 22, line_total: 44 },
        { name: "gib 13mm", unit: "sheet", quantity: 2, price: 22, line_total: 44 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toHaveLength(2);
    expect(r.warnings.join(" ")).toMatch(/duplicate/i);
  });
});

describe("assessExtraction — status rules (locked)", () => {
  it("ok: clean items + printed totals, no failures", () => {
    const v = val({
      items: [vitem({ name: "A", price: 10, quantity: 1, source_line_total: 10 })],
      subtotal: 10,
      gst: 1.5,
      total: 11.5,
    });
    expect(assessExtraction(v, []).status).toBe("ok");
  });

  it("blocked: zero usable items", () => {
    expect(assessExtraction(val({ items: [] }), []).status).toBe("blocked");
  });

  it("blocked: rejected rows AND nothing to reconcile against", () => {
    const v = val({
      items: [vitem({ name: "A", price: 10, source_line_total: 10 })],
      subtotal: null,
      total: null,
    });
    const rf = [{ index: 1, reason: "price unreadable", raw_text: null }];
    expect(assessExtraction(v, rf).status).toBe("blocked");
  });

  it("needs_review: rejected rows BUT a printed subtotal remains (partial reconcilable)", () => {
    const v = val({
      items: [vitem({ name: "A", price: 10, source_line_total: 10 })],
      subtotal: 35,
      total: 40.25,
    });
    const rf = [{ index: 1, reason: "price unreadable", raw_text: null }];
    expect(assessExtraction(v, rf).status).toBe("needs_review");
  });

  it("needs_review: no printed totals at all", () => {
    const v = val({
      items: [vitem({ name: "A", price: 10, source_line_total: 10 })],
    });
    expect(assessExtraction(v, []).status).toBe("needs_review");
  });

  it("needs_review: a row missing both price and line total", () => {
    const v = val({
      items: [vitem({ name: "A", price: null, source_line_total: null })],
      subtotal: 0,
      total: 0,
    });
    expect(assessExtraction(v, []).status).toBe("needs_review");
  });

  it("needs_review: low mean confidence", () => {
    const v = val({
      items: [
        vitem({ name: "A", price: 10, source_line_total: 10, confidence: 0.2 }),
      ],
      subtotal: 10,
      total: 11.5,
    });
    expect(assessExtraction(v, []).status).toBe("needs_review");
  });
});

describe("chooseBestExtraction — prefer the most reconcilable", () => {
  it("prefers the attempt whose lines tie out to the subtotal, even over a cleaner-status one", () => {
    const reconciles = {
      value: val({
        items: [
          vitem({ name: "A", price: 600, quantity: 1, source_line_total: 600 }),
          vitem({ name: "B", price: 400, quantity: 1, source_line_total: 400 }),
        ],
        subtotal: 1000,
        total: 1150,
      }),
      rowFailures: [{ index: 2, reason: "price unreadable", raw_text: null }],
    };
    const doesNotReconcile = {
      value: val({
        items: [vitem({ name: "A", price: 600, quantity: 1, source_line_total: 600 })],
        subtotal: 1000,
        total: 1150,
      }),
      rowFailures: [],
    };
    const best = chooseBestExtraction([doesNotReconcile, reconciles]);
    expect(best.value.items).toHaveLength(2);
  });

  it("falls back to status / fewest failures / most items when neither reconciles", () => {
    const a = {
      value: val({ items: [vitem({ name: "A", price: 10 })] }),
      rowFailures: [{ index: 1, reason: "x", raw_text: null }],
    };
    const b = {
      value: val({
        items: [vitem({ name: "A", price: 10 }), vitem({ name: "B", price: 5 })],
      }),
      rowFailures: [],
    };
    const best = chooseBestExtraction([a, b]);
    expect(best.value.items).toHaveLength(2);
  });
});
