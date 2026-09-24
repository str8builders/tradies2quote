import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { generateInvoicePdf } from "./invoice-pdf-generator";
import { computeQuoteTotals } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

/** Audit 2026-09-24, item 9 — tax is printed under the document's own label. */
afterEach(() => vi.restoreAllMocks());

describe("invoice PDF tax label", () => {
  it("a UK invoice says VAT everywhere — including the registration line", async () => {
    const items: QuoteLineItem[] = [
      { type: "labour", description: "Labour", quantity: 8, unit: "hour", unit_price: 60, line_total: 480 },
    ];
    const snapshot: QuoteData = {
      client: { name: "Example client", address: null, email: null, phone: null },
      job_summary: "Example",
      line_items: items,
      ...computeQuoteTotals(items, 0, 20),
      markup_pct: 0,
      tax_rate: 20,
      tax_label: "VAT",
      currency: "GBP",
      terms: "",
      notes: [],
    };
    const texts: string[] = [];
    const original = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
      texts.push(text);
      return original.call(this, text, options);
    });
    await generateInvoicePdf({
      invoiceNumber: "INV-1",
      createdAt: "2026-09-24T00:00:00Z",
      dueDate: null,
      snapshot,
      profile: { business_name: "Example Ltd", gst_number: "GB123456789" },
    });
    expect(texts).toContain("VAT: GB123456789");
    expect(texts).toContain("VAT (20%)");
    expect(texts.some((t) => /\bGST\b/.test(t))).toBe(false);
  });
});
