// The classic editor's "confirm key dimensions" panel, pinned by file
// snapshots taken before its draft, check and preview logic moved to
// src/lib/dimensionConfirmationForm.ts (shared with the new job page's sizes
// sheet), so the classic panel provably renders exactly as before.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/quotes/preview/q1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../actions", () => ({
  saveQuoteChanges: vi.fn(),
  confirmDimensions: vi.fn(),
}));

import { runTakeoff, type ParsedTakeoffResult } from "@/lib/aiTakeoffParser";
import { buildDimensionConfirmation } from "@/lib/dimensionConfirmation";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { QuoteEditor } from "./QuoteEditor";

const parsed = {
  type: "deck",
  input: { deckLengthM: 4.8, deckWidthM: 3, joistSpacingMm: 450, wastePercent: 10, includePiles: true },
  missingFields: [],
  assumptions: [],
  confidence: 0.4,
} as unknown as ParsedTakeoffResult;

/** A risky deck drawing: calculator lines, a labour line, sizes to confirm. */
function deckQuote(confirmed: boolean): QuoteData {
  const lines: QuoteLineItem[] = runTakeoff(parsed)!.materials.map((m) => ({
    type: "material",
    description: m.name,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: 5,
    line_total: Math.round(m.quantity * 5 * 100) / 100,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    formula: m.formula,
    price_match_key: m.priceMatchKey,
    takeoff_status: "ok",
  }));
  lines.push({ type: "labour", description: "Build the deck", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 });
  const sizes = buildDimensionConfirmation({ isDrawing: true, parsed, noScale: true })!;
  return {
    client: { name: "Jo", address: null, email: "jo@example.com", phone: null },
    job_summary: "Deck from a plan",
    line_items: lines,
    materials_subtotal: 0,
    labour_subtotal: 0,
    markup_pct: 0,
    markup_amount: 0,
    subtotal_before_tax: 0,
    tax_amount: 0,
    total: 0,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "T",
    notes: [],
    takeoff_inputs: parsed.input,
    dimension_confirmation: confirmed
      ? { ...sizes, dimensions: sizes.dimensions.map((d) => ({ ...d, confirmed: true })) }
      : sizes,
  };
}

function panel(confirmed: boolean): string {
  const html = renderToStaticMarkup(
    createElement(QuoteEditor, {
      quoteId: "q1",
      createdAt: "2026-09-01T00:00:00Z",
      initialData: deckQuote(confirmed),
      library: [],
      quoteStatus: "draft",
      publicToken: null,
      hasPdf: false,
    }),
  );
  const at = html.indexOf('data-testid="dimension-confirm"');
  expect(at).toBeGreaterThanOrEqual(0);
  const start = html.lastIndexOf("<section", at);
  return html.slice(start, html.indexOf("</section>", at) + "</section>".length);
}

describe("QuoteEditor: confirm key dimensions, exactly as before", () => {
  it("unconfirmed: the reasons, a box per size, the resulting quantities and Confirm", async () => {
    const out = panel(false);
    expect(out).toContain('data-confirmed="false"');
    expect(out).toContain('data-testid="dimension-input-deckLengthM"');
    expect(out).toContain("Resulting quantities");
    await expect(out).toMatchFileSnapshot("./__snapshots__/QuoteEditor.dimensions.unconfirmed.html");
  });

  it("confirmed: the sizes, read only", async () => {
    const out = panel(true);
    expect(out).toContain("Key dimensions confirmed.");
    await expect(out).toMatchFileSnapshot("./__snapshots__/QuoteEditor.dimensions.confirmed.html");
  });
});
