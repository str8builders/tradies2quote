import { describe, expect, it } from "vitest";
import { AI_PRICE_ESTIMATE_NOTE, parseQuote } from "../quote-generation";

describe("parseQuote (tool-input normalisation)", () => {
  it("normalises a valid quote: rounding, category clamp, defaults", () => {
    const res = parseQuote({
      jobName: "  Deck build  ",
      clientName: "  Dave  ",
      lineItems: [
        {
          description: "  H3.2 90x45  ",
          quantity: 12,
          unit: "lm",
          unitPrice: 6.005,
          lineTotal: 72.06,
          category: "materials",
        },
        {
          description: "Labour",
          quantity: 8,
          unit: "hr",
          unitPrice: 85,
          lineTotal: 680,
          category: "made-up", // invalid → clamps to "materials"
        },
      ],
      subtotal: 752.06,
      gstRate: 0.15,
      gstAmount: 112.81,
      total: 864.87,
      notes: ["10% waste on timber", 5],
      terms: "Net 7.",
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const q = res.value;
    expect(q.jobName).toBe("Deck build");
    expect(q.clientName).toBe("Dave");
    expect(q.lineItems[0].description).toBe("H3.2 90x45");
    expect(q.lineItems[0].unitPrice).toBe(6.01); // round2
    expect(q.lineItems[1].category).toBe("materials"); // clamped
    expect(q.gstRate).toBe(0.15);
    // non-string notes are dropped (the AI-price estimate note leads — item 11)
    expect(q.notes).toEqual([AI_PRICE_ESTIMATE_NOTE, "10% waste on timber"]);
  });

  it("recomputes totals when the model omits them", () => {
    const res = parseQuote({
      jobName: "X",
      lineItems: [
        { description: "A", quantity: 2, unit: "each", unitPrice: 10, lineTotal: 20, category: "materials" },
        { description: "B", quantity: 1, unit: "each", unitPrice: 30, lineTotal: 30, category: "labour" },
      ],
      notes: [],
      terms: "",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.subtotal).toBe(50);
    expect(res.value.gstAmount).toBe(7.5);
    expect(res.value.total).toBe(57.5);
    expect(res.value.clientName).toBe("TBC"); // default when absent
  });

  it("drops empty-description lines and computes lineTotal from qty×price", () => {
    const res = parseQuote({
      lineItems: [
        { description: "", quantity: 5, unit: "each", unitPrice: 9, category: "materials" },
        { description: "Real", quantity: 3, unit: "each", unitPrice: 4, category: "materials" },
      ],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.lineItems).toHaveLength(1);
    expect(res.value.lineItems[0].lineTotal).toBe(12);
  });

  it("rejects (triggers retry) when there are no usable line items", () => {
    expect(parseQuote({ lineItems: [] }).ok).toBe(false);
    expect(parseQuote({}).ok).toBe(false);
    expect(parseQuote({ lineItems: [{ description: "" }] }).ok).toBe(false);
  });
});

// Audit item 11 — the owner-only Quote Generation Agent trusted the model's
// arithmetic whenever it was present (a wrong lineTotal / subtotal / GST /
// total went straight to the screen) and showed every AI-invented NZ retail
// price as if it were real. Totals are now always recomputed through
// computeQuoteTotals, and every price the AI chose is labelled an estimate.
describe("parseQuote — deterministic totals and labelled AI prices (item 11)", () => {
  const modelSaid = {
    jobName: "Deck",
    lineItems: [
      { description: "H3.2 decking timber", quantity: 12, unit: "lm", unitPrice: 6, lineTotal: 99, category: "materials" },
      { description: "Labour", quantity: 8, unit: "hr", unitPrice: 85, lineTotal: 600, category: "labour" },
      { description: "Sparky to move a plug", quantity: 2, unit: "hr", unitPrice: 120, lineTotal: 240, category: "subcontractor" },
    ],
    // The model's own sums — all wrong.
    subtotal: 5000,
    gstAmount: 1,
    total: 10,
    notes: [],
    terms: "",
  };

  it("ignores the model's line totals and sums (was: lineTotal 99, subtotal 5000, GST 1, total 10)", () => {
    const res = parseQuote(modelSaid, { markupPct: 15, labourRate: 85 });
    if (!res.ok) throw new Error(res.error);
    const q = res.value;
    // materials carry the markup inside the line: 12 × 6 × 1.15
    expect(q.lineItems.map((l) => l.lineTotal)).toEqual([82.8, 680, 240]);
    expect(q.subtotal).toBe(1002.8);
    expect(q.gstAmount).toBe(150.42);
    expect(q.total).toBe(1153.22);
  });

  it("labels every price the AI chose as an estimate — the tradie's own labour rate is not", () => {
    const res = parseQuote(modelSaid, { markupPct: 15, labourRate: 85 });
    if (!res.ok) throw new Error(res.error);
    expect(res.value.lineItems.map((l) => l.priceIsEstimate)).toEqual([true, false, true]);
    expect(res.value.notes[0]).toBe(
      "Prices marked “estimate” are the AI's guesses at NZ retail prices, not supplier quotes — confirm each one before using this quote.",
    );
  });

  it("without a labour rate every price is an estimate, and the markup defaults to none", () => {
    const res = parseQuote(modelSaid);
    if (!res.ok) throw new Error(res.error);
    expect(res.value.lineItems.every((l) => l.priceIsEstimate)).toBe(true);
    expect(res.value.lineItems[0].lineTotal).toBe(72);
    expect(res.value.subtotal).toBe(992);
  });
});
