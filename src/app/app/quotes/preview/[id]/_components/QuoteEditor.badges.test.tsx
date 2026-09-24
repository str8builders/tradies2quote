import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";

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

const item = (o: Partial<QuoteLineItem>): QuoteLineItem => ({
  type: "material", description: "x", quantity: 1, unit: "each", unit_price: 10, line_total: 10, ...o,
});

function data(lines: QuoteLineItem[]): QuoteData {
  return {
    client: { name: "Jo", address: null, email: "jo@example.com", phone: null },
    job_summary: "job", line_items: lines,
    materials_subtotal: 0, labour_subtotal: 0, markup_pct: 0, markup_amount: 0,
    subtotal_before_tax: 0, tax_amount: 0, total: 0,
    currency: "NZD", tax_label: "GST", tax_rate: 15, terms: "T", notes: [],
  };
}

/**
 * Audit 2026-09-24, item 2 — labour and "other" rows showed no badge at
 * all, so a $0 labour line looked finished. They now carry the same
 * "Missing price" badge as materials (and the send gate warns).
 */
function render(lines: QuoteLineItem[]): string {
  return renderToStaticMarkup(
    createElement(QuoteEditor, {
      quoteId: "q1",
      createdAt: "2026-09-01T00:00:00Z",
      initialData: data(lines),
      library: [],
      quoteStatus: "draft",
      publicToken: null,
      hasPdf: false,
    }),
  );
}

/** The markup of one line-items section, up to the next section. */
function section(html: string, name: string): string {
  const at = html.indexOf(`data-testid="section-${name}"`);
  if (at < 0) throw new Error(`section-${name} not rendered`);
  const next = html.indexOf('data-testid="section-', at + 1);
  return html.slice(at, next < 0 ? undefined : next);
}

describe("QuoteEditor — missing-price badge on every line type", () => {
  it("a $0 labour row shows Missing price", () => {
    const html = render([
      item({ type: "labour", description: "Labour", unit: "hour", quantity: 10, unit_price: 0, line_total: 0 }),
    ]);
    expect(section(html, "labour")).toContain('data-testid="badge-missing-price"');
  });

  it("a price-pending other row shows Missing price", () => {
    const html = render([
      item({ type: "other", description: "Skip bin", unit: "each", quantity: 1, unit_price: 0, line_total: 0, is_missing_price: true }),
    ]);
    expect(section(html, "other")).toContain('data-testid="badge-missing-price"');
  });

  it("priced labour/other rows carry no badge", () => {
    const html = render([
      item({ type: "labour", description: "Labour", unit: "hour", quantity: 10, unit_price: 75, line_total: 750 }),
      item({ type: "other", description: "Skip bin", unit: "each", quantity: 1, unit_price: 450, line_total: 450 }),
    ]);
    expect(section(html, "labour")).not.toContain("badge-missing-price");
    expect(section(html, "other")).not.toContain("badge-missing-price");
  });

  it("a material priced at $0 without the flag is still badged", () => {
    const html = render([item({ description: "GIB", quantity: 4, unit_price: 0, line_total: 0 })]);
    expect(section(html, "materials")).toContain('data-testid="badge-missing-price"');
  });
});
