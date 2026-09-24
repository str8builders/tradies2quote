import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { generateInvoicePdf } from "./invoice-pdf-generator";
import { generateQuotePdf } from "./pdf-generator";
import { computeQuoteTotals, formatCurrency } from "./quote-defaults";
import type { QuoteData, QuoteLineItem } from "./quote-types";

afterEach(() => vi.restoreAllMocks());

const items: QuoteLineItem[] = [
  { type: "material", description: "Decking boards", quantity: 20, unit: "m", unit_price: 12.5, line_total: 250 },
  { type: "material", description: "Screws", quantity: 2, unit: "box", unit_price: 40, line_total: 80 },
  { type: "other", description: "Skip hire", quantity: 1, unit: "each", unit_price: 120, line_total: 120 },
  { type: "labour", description: "Deck build", quantity: 10, unit: "hour", unit_price: 85, line_total: 850 },
];
const snapshot: QuoteData = {
  client: { name: "Fixture Client", address: null, email: null, phone: null },
  job_summary: "Deck",
  line_items: items,
  ...computeQuoteTotals(items, 20, 15),
  markup_pct: 20,
  tax_rate: 15,
  tax_label: "GST",
  currency: "NZD",
  terms: "",
  notes: [],
};

/** Every label/value pair drawn in the totals block, in order. */
async function totalsRows(kind: "invoice" | "quote") {
  const texts: string[] = [];
  const original = PDFPage.prototype.drawText;
  const spy = vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    texts.push(text);
    return original.call(this, text, options);
  });
  const common = { createdAt: "2026-09-01T00:00:00Z", profile: { business_name: "Fixture Builders" } };
  try {
    if (kind === "invoice") {
      await generateInvoicePdf({ ...common, invoiceNumber: "INV-FIXTURE", dueDate: "2026-10-01T00:00:00Z", snapshot });
    } else {
      await generateQuotePdf({ ...common, quoteId: "12345678-abcd-1234-abcd-123456789012", quote: snapshot, acceptUrl: null });
    }
  } finally {
    spy.mockRestore();
  }
  const start = texts.indexOf("MATERIALS SUBTOTAL");
  const end = texts.findIndex((t, i) => i > start && (t === "AMOUNT DUE" || t.startsWith("TOTAL (INCL")));
  const rows: Array<[string, string]> = [];
  for (let i = start; i <= end; i += 2) rows.push([texts[i], texts[i + 1]]);
  return rows;
}

const money = (v: string) => Number(v.replace(/[^0-9.-]/g, ""));

describe("invoice PDF totals", () => {
  it("shows the markup row, so the listed lines add up to the subtotal", async () => {
    const rows = await totalsRows("invoice");
    const byLabel = new Map(rows);
    expect(snapshot.markup_amount).toBe(90);
    expect(byLabel.get("MARKUP (20%)")).toBe(formatCurrency(90, "NZD"));
    const parts = ["MATERIALS SUBTOTAL", "OTHER SUBTOTAL", "MARKUP (20%)", "LABOUR SUBTOTAL"].map((l) =>
      money(byLabel.get(l) ?? "NaN"),
    );
    expect(parts).toEqual([330, 120, 90, 850]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(money(byLabel.get("SUBTOTAL (EXCL. GST)")!));
    expect(money(byLabel.get("SUBTOTAL (EXCL. GST)")!)).toBe(snapshot.subtotal_before_tax);
    expect(money(byLabel.get("AMOUNT DUE")!)).toBe(snapshot.total);
  });

  it("uses the same breakdown rows as the quote PDF", async () => {
    const invoice = (await totalsRows("invoice")).slice(0, -1);
    const quote = (await totalsRows("quote")).slice(0, -1);
    expect(invoice).toEqual(quote);
  });
});
