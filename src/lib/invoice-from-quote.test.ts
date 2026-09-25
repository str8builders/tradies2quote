import { describe, expect, it } from "vitest";
import { checkInvoiceTotals, explainInvoiceRpcError } from "./invoice-from-quote";
import { computeQuoteTotals } from "./quote-defaults";
import { assessQuoteTotalsIntegrity } from "./quote-validation";
import type { QuoteData, QuoteLineItem } from "./quote-types";

// Audit item 6 — the send gate allows 1¢ of drift between the stored totals
// and the lines (moneyEquals), but create_invoice_from_quote requires the
// stored figures to agree to the cent (total = subtotal + GST = total_amount).
// A quote the gate accepted could then never be invoiced, with the message
// "Mark the quote complete before invoicing" on a quote that WAS complete.

const line = (quantity: number, unit_price: number, type: QuoteLineItem["type"] = "material"): QuoteLineItem => ({
  type,
  description: `${type} ${quantity} × ${unit_price}`,
  quantity,
  unit: "each",
  unit_price,
  line_total: Math.round(quantity * unit_price * 100) / 100,
});

function quoteData(items: QuoteLineItem[], override: Partial<QuoteData> = {}): QuoteData {
  const totals = computeQuoteTotals(items, 20, 15);
  return {
    client: { name: "Kim", address: null, email: "kim@example.com", phone: null },
    job_summary: "Job",
    line_items: items,
    markup_pct: 20,
    ...totals,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
    terms: "",
    notes: [],
    ...override,
  };
}

const ITEMS = [line(3, 33.33), line(2, 75, "labour")];
// materials 99.99, markup 20.00 (19.998), labour 150, subtotal 269.99, GST 40.50 (40.4985), total 310.49

describe("checkInvoiceTotals — recompute from the lines before the invoice RPC", () => {
  it("exact stored totals: invoice straight away", () => {
    const qd = quoteData(ITEMS);
    expect(qd.total).toBe(310.49);
    expect(checkInvoiceTotals({ status: "completed", total_amount: 310.49, quote_data: qd })).toEqual({ action: "invoice" });
  });

  it("a 1¢ drift the send gate lets through (total 310.50) is caught before the RPC", () => {
    const qd = quoteData(ITEMS, { total: 310.5 });
    // The send gate tolerates it …
    expect(assessQuoteTotalsIntegrity(qd)).toEqual([]);
    // … the invoice RPC would not (310.50 ≠ 269.99 + 40.50).
    const check = checkInvoiceTotals({ status: "draft", total_amount: 310.5, quote_data: qd });
    expect(check.action).toBe("resave_then_invoice");
    if (check.action !== "resave_then_invoice") throw new Error("unreachable");
    expect(check.quote_data.total).toBe(310.49);
    expect(check.total_amount).toBe(310.49);
    expect(check.drift).toEqual(["total: saved $310.50, the lines add up to $310.49"]);
  });

  it("a completed (locked) quote whose own figures agree is invoiced as accepted, and the drift is reported for the log", () => {
    // Stored with the old round-down GST: 40.49 instead of 40.50, total 310.48.
    const qd = quoteData(ITEMS, { tax_amount: 40.49, total: 310.48 });
    const check = checkInvoiceTotals({ status: "completed", total_amount: 310.48, quote_data: qd });
    expect(check).toEqual({
      action: "invoice_and_log",
      drift: [
        "GST amount: saved $40.49, the lines add up to $40.50",
        "total: saved $310.48, the lines add up to $310.49",
      ],
    });
  });

  it("a completed (locked) quote whose figures don't agree is NOT written and gets a plain message (the RPC would reject it)", () => {
    const qd = quoteData(ITEMS, { total: 310.5 });
    const check = checkInvoiceTotals({ status: "completed", total_amount: 310.5, quote_data: qd });
    expect(check.action).toBe("refuse");
    if (check.action !== "refuse") throw new Error("unreachable");
    expect(check.message).toBe(
      "This quote's saved totals don't add up: subtotal $269.99 + GST $40.50 is $310.49, but its total says $310.50. It's locked because your customer accepted it, so it can't be changed here and no invoice was made. Contact support@tradies2quote.com and we'll fix it.",
    );
  });

  it("a stored total_amount that differs from the quote's total is refused on a locked quote", () => {
    const qd = quoteData(ITEMS);
    const check = checkInvoiceTotals({ status: "completed", total_amount: 310.5, quote_data: qd });
    expect(check.action).toBe("refuse");
    if (check.action !== "refuse") throw new Error("unreachable");
    expect(check.message).toMatch(/saved total \(\$310\.50\) doesn't match the total on the quote \(\$310\.49\)/);
  });

  it("a stale line total is part of the drift too", () => {
    const items = [{ ...line(3, 33.33), line_total: 100 }, line(2, 75, "labour")];
    const check = checkInvoiceTotals({ status: "sent", total_amount: 310.49, quote_data: quoteData(items) });
    expect(check.action).toBe("resave_then_invoice");
    if (check.action !== "resave_then_invoice") throw new Error("unreachable");
    expect(check.quote_data.line_items[0].line_total).toBe(99.99);
    expect(check.drift).toContain('line "material 3 × 33.33": saved $100.00, quantity × price is $99.99');
  });
});

describe("explainInvoiceRpcError — SQLSTATE 22023 in plain words", () => {
  const err = (message: string) => ({ code: "22023", message });

  it("'Quote totals must be consistent' says the totals don't add up (was 'Mark the quote complete before invoicing')", () => {
    expect(explainInvoiceRpcError(err("Quote totals must be consistent"))).toEqual({
      code: "22023",
      error:
        "This quote's saved totals don't add up, so the invoice wasn't made. Open the quote and save it to recalculate, or contact support@tradies2quote.com if it's locked.",
    });
  });

  it("'Quote has no line items' says so (was 'Mark the quote complete before invoicing')", () => {
    expect(explainInvoiceRpcError(err("Quote has no line items")).error).toBe(
      "This quote has no line items, so there's nothing to put on an invoice.",
    );
  });

  it("'Quote must be completed' keeps the complete-first message", () => {
    expect(explainInvoiceRpcError(err("Quote must be completed")).error).toBe(
      "Mark the quote complete before invoicing — only completed quotes can become invoices.",
    );
  });

  it("any other 22023 gets a plain generic message, never the raw text", () => {
    expect(explainInvoiceRpcError(err("something new")).error).toBe(
      "The invoice couldn't be made from this quote — its details didn't pass the checks.",
    );
  });

  it("keeps the other SQLSTATE mappings", () => {
    expect(explainInvoiceRpcError({ code: "28000" }).error).toBe("You need to sign in to do that.");
    expect(explainInvoiceRpcError({ code: "P0002" }).error).toBe("Quote not found.");
    expect(explainInvoiceRpcError({ code: "42501" }).error).toBe("You don't own this quote.");
  });
});
