/**
 * Turning a client's hours into an invoice (the owner's "Invoice this
 * week"). One labour line per day ("Labour, Mon 22 Sept": everyone's hours
 * that day), at one hourly rate, with tax and totals from the app's single
 * totals function (computeQuoteTotals), in the QuoteData shape every invoice
 * carries, so the PDF, email and job page work unchanged. The database
 * (create_timesheet_invoice) re-checks the hours and line totals. Pure.
 */

import { computeQuoteTotals, round2 } from "@/lib/quote-defaults";
import type { QuoteClient, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { DEFAULT_INVOICE_TERM_DAYS } from "@/lib/invoice-due-date";
import { sumHours } from "./hours";
import { dayLabel } from "./week";

export interface BillableEntry {
  id: string;
  workDate: string;
  hours: number;
  note: string | null;
  /** Who worked, for the notes ("Sione"). */
  person: string;
}

export interface TimesheetInvoiceInput {
  entries: readonly BillableEntry[];
  rate: number;
  client: QuoteClient;
  /** "22 to 28 Sept". */
  period: string;
  currency: string;
  taxLabel: string;
  taxRate: number;
}

export type TimesheetInvoiceResult =
  | { ok: true; quoteData: QuoteData; hours: number; entryIds: string[] }
  | { ok: false; error: string };

export const MAX_RATE = 10000;

/** A charge-out rate typed on the sheet: dollars and cents, above zero. */
export function parseRate(value: string | number): number | null {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > MAX_RATE) return null;
  return round2(n);
}

/** The hours grouped by day, earliest first. */
export function hoursByDay(entries: readonly BillableEntry[]): Array<{ day: string; hours: number; entries: BillableEntry[] }> {
  const days = new Map<string, BillableEntry[]>();
  for (const entry of entries) days.set(entry.workDate, [...(days.get(entry.workDate) ?? []), entry]);
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => ({ day, hours: sumHours(list.map((e) => e.hours)), entries: list }));
}

/** The invoice's QuoteData for these hours, or why not. */
export function buildTimesheetInvoice(input: TimesheetInvoiceInput): TimesheetInvoiceResult {
  if (input.entries.length === 0) return { ok: false, error: "There are no hours to invoice for this client." };
  const rate = parseRate(input.rate);
  if (rate === null) return { ok: false, error: "Put in an hourly rate above $0." };
  if (!input.client.name.trim()) return { ok: false, error: "This client needs a name." };

  const days = hoursByDay(input.entries);
  const line_items: QuoteLineItem[] = days.map(({ day, hours }) => ({
    type: "labour",
    description: `Labour, ${dayLabel(day)}`,
    quantity: hours,
    unit: "h",
    unit_price: rate,
    line_total: round2(hours * rate),
  }));
  const totals = computeQuoteTotals(line_items, 0, input.taxRate);
  const notes = days.flatMap(({ day, entries }) =>
    entries
      .filter((e) => e.note?.trim())
      .map((e) => `${dayLabel(day)}: ${e.note!.trim()} (${e.person})`),
  );
  const hours = sumHours(days.map((d) => d.hours));
  const quoteData: QuoteData = {
    client: input.client,
    job_summary: `Labour, ${input.period}`,
    line_items,
    materials_subtotal: totals.materials_subtotal,
    labour_subtotal: totals.labour_subtotal,
    markup_pct: 0,
    markup_amount: totals.markup_amount,
    subtotal_before_tax: totals.subtotal_before_tax,
    tax_amount: totals.tax_amount,
    total: totals.total,
    currency: input.currency,
    tax_label: input.taxLabel,
    tax_rate: input.taxRate,
    terms: `Payment due within ${DEFAULT_INVOICE_TERM_DAYS} days.`,
    notes,
  };
  return { ok: true, quoteData, hours, entryIds: input.entries.map((e) => e.id) };
}
