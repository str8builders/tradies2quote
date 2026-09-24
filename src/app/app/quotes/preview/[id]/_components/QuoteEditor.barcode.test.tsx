import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuoteData, QuoteStatus } from "@/lib/quote-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/quotes/preview/q1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../actions", () => ({
  saveQuoteChanges: vi.fn(),
  confirmDimensions: vi.fn(),
}));

import { QuoteEditor } from "./QuoteEditor";

const data: QuoteData = {
  client: { name: "Jo", address: null, email: "jo@example.com", phone: null },
  job_summary: "Deck repair",
  line_items: [
    { type: "material", description: "Pine 90x45", quantity: 4, unit: "m", unit_price: 4.2, line_total: 16.8 },
  ],
  materials_subtotal: 16.8,
  labour_subtotal: 0,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 16.8,
  tax_amount: 2.52,
  total: 19.32,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "T",
  notes: [],
};

function render(quoteStatus: QuoteStatus | string): string {
  return renderToStaticMarkup(
    createElement(QuoteEditor, {
      quoteId: "q1",
      createdAt: "2026-09-01T00:00:00Z",
      initialData: data,
      library: [],
      quoteStatus: quoteStatus as QuoteStatus,
      publicToken: null,
      hasPdf: false,
    }),
  );
}

describe("QuoteEditor — Scan barcode", () => {
  it.each(["draft", "sent", "viewed", "declined", "expired"])("is offered while a %s quote can be edited", (status) => {
    expect(render(status)).toContain('data-testid="scan-barcode-button"');
  });

  it.each(["accepted", "scheduled", "in_progress", "completed", "invoiced", "something_new"])(
    "is hidden once a %s quote is locked",
    (status) => {
      expect(render(status)).not.toContain('data-testid="scan-barcode-button"');
    },
  );

  it("sits with the materials, not in the page's first paint of the sheet", () => {
    const html = render("draft");
    const materials = html.indexOf('data-testid="section-materials"');
    const labour = html.indexOf('data-testid="section-labour"');
    const button = html.indexOf('data-testid="scan-barcode-button"');
    expect(materials).toBeGreaterThan(-1);
    expect(button).toBeGreaterThan(materials);
    expect(button).toBeLessThan(labour);
    // The sheet itself only mounts when the button is tapped.
    expect(html).not.toContain('data-testid="barcode-scan-sheet"');
  });
});
