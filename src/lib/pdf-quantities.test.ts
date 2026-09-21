import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { writeFileSync } from "node:fs";
import { generateQuotePdf } from "./pdf-generator";
import { generateInvoicePdf } from "./invoice-pdf-generator";
import { computeQuoteTotals } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

afterEach(() => vi.restoreAllMocks());

describe("quote and invoice quantity columns", () => {
  it.each([null, "", " \t "])("refuses an unbranded quote PDF (%s)", async (business_name) => {
    await expect(generateQuotePdf({ quoteId: "fixture", createdAt: "2026-09-13T00:00:00Z", quote: {} as QuoteData, profile: { business_name }, acceptUrl: null })).rejects.toThrow("Add your business name in Settings");
  });
  it.each([["quote", false], ["invoice", false], ["quote", true], ["invoice", true]] as const)("%s keeps quantities within their cells (long description: %s)", async (kind, longDescription) => {
    const items: QuoteLineItem[] = Array.from({ length: 34 }, (_, i) => ({
      type: "material", description: i === 0 ? "Post-hole concrete after round post deduction" : `Material ${i + 1} — measured order from saved calculation`,
      quantity: i % 2 === 0 ? 0.237504404611388 : 1299999.9999999998,
      unit: i % 2 === 0 ? "m³" : "each",
      unit_price: i % 2 === 0 ? 400 : 0.123456789012345,
      line_total: Math.round((i % 2 === 0 ? 0.237504404611388 * 400 : 1299999.9999999998 * 0.123456789012345) * 100) / 100,
    }));
    if (longDescription) items[1].description = "Custom-material-".repeat(700);
    const quote: QuoteData = {
      client: { name: "Audit example — no customer", address: null, email: null, phone: null },
      job_summary: "Quantity and rate precision example. Local audit fixture only.",
      line_items: items, ...computeQuoteTotals(items, 20, 15),
      markup_pct: 20, tax_rate: 15, tax_label: "GST", currency: "NZD", terms: "", notes: [],
    };
    const calls: { text: string; x: number; y: number; width: number; page: PDFPage }[] = [];
    const original = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options = {}) {
      const width = options.font?.widthOfTextAtSize(text, options.size ?? 10) ?? 0;
      calls.push({ text, x: options.x ?? 0, y: options.y ?? 0, width, page: this });
      return original.call(this, text, options);
    });
    const common = { createdAt: "2026-09-06T00:00:00Z", profile: { business_name: "T2Q audit example" } };
    const bytes = kind === "quote"
      ? await generateQuotePdf({ ...common, quoteId: "12345678-abcd-1234-abcd-123456789012", quote, acceptUrl: null })
      : await generateInvoicePdf({ ...common, invoiceNumber: "AUDIT-001", dueDate: null, snapshot: quote });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.x + call.width).toBeLessThanOrEqual(547.29);
      expect(call.y).toBeGreaterThanOrEqual(call.text.includes("Page ") ? 32 : 80);
      if (call.x === 282 && call.text !== "QTY") expect(call.x + call.width).toBeLessThanOrEqual(376.01);
      if (call.x === 386 && call.text !== "UNIT PRICE") expect(call.x + call.width).toBeLessThanOrEqual(462.01);
    }
    expect(calls.some(c => c.text === "0.237504 m3")).toBe(true);
    expect(calls.some(c => c.text === "$0.123456789012345")).toBe(true);
    expect(calls.some(c => c.text === "MARKUP (20%)")).toBe(true);
    if (kind === "invoice") {
      expect(calls.find(c => c.text === "PAYMENT")?.page).toBe(calls.find(c => c.text === "AMOUNT DUE")?.page);
    }
    const pagesWithItems = new Set(calls.filter(c => c.x === 282 && c.text !== "QTY").map(c => c.page));
    for (const page of pagesWithItems) expect(calls.some(c => c.page === page && c.text === "QTY")).toBe(true);
    if (process.env.AUDIT_PDF_DIR && !longDescription) writeFileSync(`${process.env.AUDIT_PDF_DIR}/${kind}-quantity-example.pdf`, bytes);
  });
});
