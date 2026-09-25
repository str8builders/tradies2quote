import { describe, expect, it } from "vitest";
import { aiTermsToNotes, sanitiseModelQuote } from "../model-output";

/** Audit 2026-09-24 — items 3 (whitelist the model) and 5 (terms). */

describe("sanitiseModelQuote — whitelist", () => {
  it("keeps only type/description/quantity/unit/unit_price per line", () => {
    const out = sanitiseModelQuote({
      line_items: [
        {
          type: "material",
          description: "Mystery product",
          quantity: 1,
          unit: "each",
          unit_price: 999,
          line_total: 5,
          price_source: "user_library",
          price_confidence: "high",
          library_id: "someone-elses-row",
          is_missing_price: false,
          quantity_source: "calculator",
          quantity_confirmed: true,
          takeoff_status: "ok",
          warnings: [],
          source_line_total: 999,
        },
      ],
    });
    expect(out.line_items).toEqual([
      {
        type: "material",
        description: "Mystery product",
        quantity: 1,
        unit: "each",
        unit_price: 999,
        line_total: 999, // recomputed, never the model's
      },
    ]);
  });

  it("drops every top-level field the server owns", () => {
    const out = sanitiseModelQuote({
      client: { name: "Dave", address: "Maple St", email: "d@example.com", phone: "021", contact: "x" },
      job_summary: "Deck",
      line_items: [],
      notes: ["a", { injected: true }, "b"],
      terms: "Quote valid 30 days from issue.",
      total: 1,
      tax_rate: 0,
      currency: "USD",
      dimension_confirmation: { required: false },
      supplier_source: { subtotal: 1 },
      verification: { ok: true, issues: [], checkedBy: ["critic"] },
      compliance_review: { status: "ok" },
      chat_history: [],
    });
    expect(Object.keys(out).sort()).toEqual(["aiTerms", "client", "job_summary", "line_items", "notes"]);
    expect(out.client).toEqual({ name: "Dave", address: "Maple St", email: "d@example.com", phone: "021" });
    expect(out.notes).toEqual(["a", "b"]);
  });

  it("coerces junk: negative/NaN → 0, unknown type → material, 'Labour' → labour, missing client", () => {
    const out = sanitiseModelQuote({
      line_items: [
        { type: "Labour", description: 12, quantity: -3, unit: 5, unit_price: "abc" },
        { type: "weird", description: null, quantity: "2", unit_price: 4 },
        "not an object",
      ],
    });
    expect(out.line_items).toHaveLength(2);
    expect(out.line_items[0]).toMatchObject({ type: "labour", description: "12", quantity: 0, unit: "5", unit_price: 0 });
    expect(out.line_items[1]).toMatchObject({ type: "material", description: "", quantity: 2, unit_price: 4 });
    expect(out.client.name).toBe("To be confirmed");
    expect(sanitiseModelQuote(null).line_items).toEqual([]);
  });
});

describe("aiTermsToNotes — the tradie's terms are never replaced", () => {
  it("drops the prompt's standard boilerplate (the template covers it)", () => {
    expect(
      aiTermsToNotes(
        "Quote valid 30 days from issue.\nFinal payment due on completion.\nVariations to be agreed in writing before work proceeds.\nExcludes consents and council fees unless specifically noted.\n- 50% deposit required on acceptance for jobs over NZD 5,000",
      ),
    ).toEqual([]);
  });

  it("keeps job-specific conditions as review notes", () => {
    const notes = aiTermsToNotes(
      "Quote valid 30 days from issue. Excludes stopping and painting — quoted by others.\n50% deposit, balance on completion.",
    );
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/not added to your terms/);
    expect(notes[0]).toMatch(/Excludes stopping and painting/);
    expect(notes[1]).toMatch(/50% deposit, balance on completion/);
  });

  it("caps the number of notes", () => {
    const many = Array.from({ length: 12 }, (_, i) => `Condition ${i + 1} applies`).join("\n");
    expect(aiTermsToNotes(many)).toHaveLength(5);
  });
});

describe("sanitiseModelQuote — the 200-line cap is never silent (audit item 9)", () => {
  const lines = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      type: "material",
      description: `Item ${i + 1}`,
      quantity: 1,
      unit: "each",
      unit_price: 1,
    }));

  it("keeps the first 200 of 250 lines and says 50 were left off (was dropped silently)", () => {
    const out = sanitiseModelQuote({
      line_items: lines(250),
      notes: Array.from({ length: 60 }, (_, i) => `note ${i + 1}`),
    });
    expect(out.line_items).toHaveLength(200);
    expect(out.line_items[199].description).toBe("Item 200");
    // First, so the model's own notes (capped at 40) can never push it out.
    expect(out.notes[0]).toBe(
      'The AI returned 250 lines but only the first 200 fit on a quote — 50 were left off, starting at "Item 201". Check nothing\'s missing before sending.',
    );
    expect(out.notes).toHaveLength(41);
  });

  it("adds no note at or under the cap", () => {
    const out = sanitiseModelQuote({ line_items: lines(200) });
    expect(out.line_items).toHaveLength(200);
    expect(out.notes).toEqual([]);
  });
});
