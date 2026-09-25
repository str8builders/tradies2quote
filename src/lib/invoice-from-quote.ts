// ─────────────────────────────────────────────────────────────────────────
// Invoice-from-quote guard (audit item 6). Pure — the server action does I/O.
//
// The send gate allows 1¢ of drift between a quote's stored totals and its
// lines (moneyEquals — so float noise never false-blocks), but the
// create_invoice_from_quote RPC requires the stored figures to agree to the
// cent: total = subtotal before tax + tax, and quotes.total_amount = total. A
// quote the gate accepted could then fail at invoicing, and SQLSTATE 22023
// was always explained as "Mark the quote complete".
//
// Fixed in the app, not the database: before the RPC the totals are
// recomputed from the lines with computeQuoteTotals (the single source of
// truth) and compared to the cent.
//   - Editable quote that drifted → re-save the recomputed totals first.
//   - Locked quote (accepted → completed; the post-acceptance lock trigger
//     refuses content writes) → never written:
//       · its own figures still agree → invoice what the customer accepted,
//         and log the drift;
//       · they don't → the RPC would reject it: a plain message, and log it.
// ─────────────────────────────────────────────────────────────────────────

import {
  clampMarkupPct,
  clampTaxRate,
  computeQuoteTotals,
  formatCurrency,
  round2,
} from "./quote-defaults";
import { isQuoteLocked } from "./lifecycle/lock";
import { LEGAL } from "./legal";
import type { QuoteData, QuoteLineItem } from "./quote-types";

export type InvoiceTotalsCheck =
  /** Stored totals are exact — call the RPC. */
  | { action: "invoice" }
  /** Editable quote drifted — save the recomputed totals, then invoice. */
  | {
      action: "resave_then_invoice";
      quote_data: QuoteData;
      total_amount: number;
      drift: string[];
    }
  /** Locked quote drifted from its lines, but its own figures agree — invoice the accepted totals, log the drift. */
  | { action: "invoice_and_log"; drift: string[] }
  /** The RPC would reject this quote and it can't be fixed here — plain message, log it. */
  | { action: "refuse"; message: string; drift: string[] };

type QuoteRow = {
  status: string | null;
  total_amount: number | string | null;
  quote_data: QuoteData | null;
};

const SUPPORT = LEGAL.supportEmail;

/** A stored money figure as the RPC reads it (numeric rounded to 2 dp), or null. */
function stored(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : null;
}

export function checkInvoiceTotals(row: QuoteRow): InvoiceTotalsCheck {
  const qd = row.quote_data;
  // No lines: nothing to recompute — the RPC's own message covers it.
  if (!qd || !Array.isArray(qd.line_items) || qd.line_items.length === 0) {
    return { action: "invoice" };
  }
  const money = (n: number) => formatCurrency(n, qd.currency || "NZD");
  const taxLabel = qd.tax_label || "tax";

  const markup_pct = clampMarkupPct(qd.markup_pct);
  const tax_rate = clampTaxRate(qd.tax_rate);
  const lines: QuoteLineItem[] = qd.line_items.map((it) => {
    const quantity = Number(it.quantity) || 0;
    const unit_price = Number(it.unit_price) || 0;
    return { ...it, quantity, unit_price, line_total: round2(quantity * unit_price) };
  });
  const want = computeQuoteTotals(lines, markup_pct, tax_rate);

  if (!(want.total > 0)) {
    return {
      action: "refuse",
      message: `This quote's total is ${money(want.total)}, so there's nothing to put on an invoice.`,
      drift: [],
    };
  }

  const drift: string[] = [];
  qd.line_items.forEach((it, i) => {
    const saved = stored(it.line_total);
    if (saved !== lines[i].line_total) {
      drift.push(
        `line "${it.description}": saved ${saved === null ? "nothing" : money(saved)}, quantity × price is ${money(lines[i].line_total)}`,
      );
    }
  });
  const fields: Array<[string, unknown, number]> = [
    ["materials subtotal", qd.materials_subtotal, want.materials_subtotal],
    ["labour subtotal", qd.labour_subtotal, want.labour_subtotal],
    ["markup", qd.markup_amount, want.markup_amount],
    ["subtotal before tax", qd.subtotal_before_tax, want.subtotal_before_tax],
    [`${taxLabel} amount`, qd.tax_amount, want.tax_amount],
    ["total", qd.total, want.total],
  ];
  for (const [label, value, expected] of fields) {
    const saved = stored(value);
    if (saved !== expected) {
      drift.push(
        `${label}: saved ${saved === null ? "nothing" : money(saved)}, the lines add up to ${money(expected)}`,
      );
    }
  }
  const savedTotal = stored(qd.total);
  const savedColumn = stored(row.total_amount);
  if (savedColumn !== savedTotal) {
    drift.push(
      `saved quote total ${savedColumn === null ? "missing" : money(savedColumn)} differs from the quote's total ${savedTotal === null ? "(missing)" : money(savedTotal)}`,
    );
  }
  if (drift.length === 0) return { action: "invoice" };

  if (!isQuoteLocked(row.status)) {
    return {
      action: "resave_then_invoice",
      quote_data: { ...qd, line_items: lines, markup_pct, tax_rate, ...want },
      total_amount: want.total,
      drift,
    };
  }

  // Locked: never written. Would the RPC still accept the figures as saved?
  const sub = stored(qd.subtotal_before_tax);
  const tax = stored(qd.tax_amount);
  const locked =
    "It's locked because your customer accepted it, so it can't be changed here and no invoice was made.";
  const contact = `Contact ${SUPPORT} and we'll fix it.`;
  if (savedTotal === null || sub === null || tax === null) {
    return {
      action: "refuse",
      message: `This quote is missing its saved totals. ${locked} ${contact}`,
      drift,
    };
  }
  if (!(savedTotal > 0) || sub < 0 || tax < 0) {
    return {
      action: "refuse",
      message: `This quote's saved total is ${money(savedTotal)}, so it can't become an invoice. ${locked} ${contact}`,
      drift,
    };
  }
  if (round2(sub + tax) !== savedTotal) {
    return {
      action: "refuse",
      message: `This quote's saved totals don't add up: subtotal ${money(sub)} + ${taxLabel} ${money(tax)} is ${money(round2(sub + tax))}, but its total says ${money(savedTotal)}. ${locked} ${contact}`,
      drift,
    };
  }
  if (savedColumn !== savedTotal) {
    return {
      action: "refuse",
      message: `This quote's saved total (${savedColumn === null ? "missing" : money(savedColumn)}) doesn't match the total on the quote (${money(savedTotal)}). ${locked} ${contact}`,
      drift,
    };
  }
  return { action: "invoice_and_log", drift };
}

type PostgresErrorShape = { code?: string; message?: string };

/** create_invoice_from_quote errors in plain words — never the raw SQL text. */
export function explainInvoiceRpcError(err: unknown): { error: string; code?: string } {
  const e = (err ?? {}) as PostgresErrorShape;
  const code = e.code;
  const message = e.message ?? "";
  if (code === "28000") return { error: "You need to sign in to do that.", code };
  if (code === "P0002") return { error: "Quote not found.", code };
  if (code === "42501") return { error: "You don't own this quote.", code };
  if (code === "22023") {
    // One SQLSTATE, three different causes — say which.
    if (/must be completed/i.test(message)) {
      return {
        error: "Mark the quote complete before invoicing — only completed quotes can become invoices.",
        code,
      };
    }
    if (/no line items/i.test(message)) {
      return { error: "This quote has no line items, so there's nothing to put on an invoice.", code };
    }
    if (/totals must be consistent/i.test(message)) {
      return {
        error: `This quote's saved totals don't add up, so the invoice wasn't made. Open the quote and save it to recalculate, or contact ${SUPPORT} if it's locked.`,
        code,
      };
    }
    return {
      error: "The invoice couldn't be made from this quote — its details didn't pass the checks.",
      code,
    };
  }
  return { error: e.message || "Could not create the invoice draft.", code };
}
