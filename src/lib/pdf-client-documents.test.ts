import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { generateQuotePdf } from "./pdf-generator";
import { generateInvoicePdf } from "./invoice-pdf-generator";
import { computeQuoteTotals } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

/**
 * The quote and invoice PDFs are the client's documents (audit 2026-09-28):
 * the tradie's markup is folded into the prices, never printed; pounds,
 * euros and accents print as themselves; the "valid until" date is the date
 * the client's link stops working.
 */
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const items: QuoteLineItem[] = [
  { type: "material", description: "Decking boards", quantity: 20, unit: "m", unit_price: 12.5, line_total: 250 },
  { type: "material", description: "Screws", quantity: 2, unit: "box", unit_price: 40, line_total: 80 },
  { type: "other", description: "Skip hire", quantity: 1, unit: "each", unit_price: 120, line_total: 120 },
  { type: "labour", description: "Deck build", quantity: 10, unit: "hour", unit_price: 85, line_total: 850 },
];

function quote(overrides: Partial<QuoteData> = {}, lines = items, markup = 20, tax = 15): QuoteData {
  return {
    client: { name: "Aroha Ngata", address: "12 Te Awa St, Pāpāmoa", email: null, phone: null },
    job_summary: "Deck at Pāpāmoa",
    line_items: lines,
    ...computeQuoteTotals(lines, markup, tax),
    markup_pct: markup,
    tax_rate: tax,
    tax_label: "GST",
    currency: "NZD",
    terms: "Quote valid 30 days from issue.\nFinal payment due on completion.",
    notes: [],
    ...overrides,
  };
}

async function drawnTexts(render: () => Promise<Uint8Array>): Promise<string[]> {
  const texts: string[] = [];
  const original = PDFPage.prototype.drawText;
  const spy = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    texts.push(text);
    return original.call(this, text, options);
  });
  try {
    await render();
  } finally {
    spy.mockRestore();
  }
  return texts;
}

const renderQuote = (q: QuoteData, validUntil?: string | null) =>
  drawnTexts(() =>
    generateQuotePdf({
      quoteId: "12345678-abcd-1234-abcd-123456789012",
      createdAt: "2026-09-01T00:00:00Z",
      quote: q,
      profile: { business_name: "Bayside Builders" },
      acceptUrl: "https://tradies2quote.com/quote/fixture",
      validUntil,
    }),
  );

const renderInvoice = (q: QuoteData) =>
  drawnTexts(() =>
    generateInvoicePdf({
      invoiceNumber: "INV-FIXTURE",
      createdAt: "2026-09-01T00:00:00Z",
      dueDate: "2026-10-01T00:00:00Z",
      snapshot: q,
      profile: { business_name: "Bayside Builders" },
    }),
  );

describe.each([
  ["quote", (q: QuoteData) => renderQuote(q)],
  ["invoice", renderInvoice],
] as const)("%s PDF — what the client reads", (_kind, render) => {
  it("never mentions the markup; the prices already carry it", async () => {
    const texts = await render(quote());
    expect(texts.filter((t) => /mark\s*-?\s*up/i.test(t))).toEqual([]);
    // Decking $250 + 20% = $300, screws $96, skip hire $144; labour as priced.
    for (const shown of ["$300.00", "$96.00", "$144.00", "$850.00", "$15.00", "$48.00"]) {
      expect(texts).toContain(shown);
    }
    for (const tradieOnly of ["$250.00", "$80.00", "$90.00", "$12.50"]) {
      expect(texts).not.toContain(tradieOnly);
    }
  });

  it("prints pounds, euros and accents instead of ?", async () => {
    const uk = quote(
      { currency: "GBP", tax_label: "VAT", client: { name: "Zoë Brontë", address: "1 Café Row", email: null, phone: null } },
      [{ type: "labour", description: "Fit kitchen — 2 days", quantity: 1, unit: "job", unit_price: 1234.5, line_total: 1234.5 }],
      0,
      20,
    );
    const texts = await render(uk);
    expect(texts).toContain("£1,234.50");
    expect(texts).toContain("Zoë Brontë");
    expect(texts).toContain("1 Café Row");
    expect(texts.some((t) => t.includes("Fit kitchen — 2 days"))).toBe(true);
    expect(texts.filter((t) => t.includes("?"))).toEqual([]);
  });

  it("writes Māori place names without ? and keeps the terms' line breaks", async () => {
    const texts = await render(quote());
    expect(texts).toContain("12 Te Awa St, Papamoa");
    expect(texts.filter((t) => t.includes("?"))).toEqual([]);
    if (_kind === "quote") {
      expect(texts).toContain("Quote valid 30 days from issue.");
      expect(texts).toContain("Final payment due on completion.");
    }
  });
});

describe("quote PDF — valid until", () => {
  it("prints the date the client's link stops working", async () => {
    const texts = await renderQuote(quote(), "2026-10-29T00:00:00Z");
    expect(texts).toContain("Valid until 29 Oct 2026");
  });

  it("an unsent draft shows what a send today would set: today + 30 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-09-28T10:00:00.000Z") });
    expect(await renderQuote(quote(), null)).toContain("Valid until 28 Oct 2026");
    expect(await renderQuote(quote(), undefined)).toContain("Valid until 28 Oct 2026");
    // Never the old created + 30 days.
    expect(await renderQuote(quote(), undefined)).not.toContain("Valid until 01 Oct 2026");
  });
});
