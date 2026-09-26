/**
 * Reading and scoring for the supplier-quote golden eval. The eval
 * (./supplier-quote-eval.test.ts) calls these with the real model; the
 * fixture checks (./supplier-quote-cases-checks.test.ts) call them with a
 * fake one, so the wiring is proven before anyone spends a token.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { keepMoreReliable, mergeRepeatedNames } from "@/lib/materials/libraryImport";
import { mergeExtractions, type ScanPage } from "@/lib/materials/mergeExtractions";
import type { SupplierQuoteExtraction } from "@/lib/materials/quoteExtraction";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import {
  READ_DEADLINE_MS,
  prepareSupplierUpload,
  readSupplierDocument,
} from "@/lib/materials/supplierDocReader";
import type { SupplierQuoteCase } from "./supplier-quote-cases";

export const SUPPLIER_FIXTURES = resolve(process.cwd(), "src/eval/fixtures/supplier-quotes");

export function fixtureMime(file: string): string {
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

const cents = (a: number | null | undefined, b: number) => a != null && Math.abs(a - b) < 0.005;
const money = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(2));

/**
 * Read a case exactly as the app does — the route's upload preparation and
 * reader, one call per file, the pages merged — and return the merged read.
 */
export async function readSupplierCase(
  apiKey: string,
  c: SupplierQuoteCase,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<ScanPage> {
  const pages: ScanPage[] = [];
  for (const file of c.files) {
    const bytes = new Uint8Array(readFileSync(resolve(SUPPLIER_FIXTURES, file)));
    const prepared = await prepareSupplierUpload(bytes, { name: file, type: fixtureMime(file) });
    if (!prepared.ok) throw new Error(`${file}: ${prepared.error}`);
    const read = await readSupplierDocument({
      apiKey,
      doc: prepared.doc,
      mode: "quote",
      deadlineAt: Date.now() + READ_DEADLINE_MS,
      fetchImpl: opts.fetchImpl,
    });
    if (!read.ok) throw new Error(`${file}: ${read.body.error}`);
    pages.push({
      ...read.value,
      extraction_status: read.status,
      extraction_reasons: read.reasons,
      row_failures: read.rowFailures,
      warnings: read.warnings,
      attempts: read.attempts,
    });
  }
  return mergeExtractions(pages);
}

/** A merged read in the shape the reconciliation checks. */
function asExtraction(read: ScanPage): SupplierQuoteExtraction {
  return {
    supplier: read.supplier,
    quote_number: read.quote_number ?? null,
    currency: read.currency,
    gst_inclusive: read.gst_inclusive,
    items: read.items.map((i) => ({
      name: i.name,
      unit: i.unit,
      price: i.price,
      sku: i.sku,
      quantity: i.quantity ?? null,
      pieces: i.pieces ?? null,
      source_line_total: i.source_line_total ?? null,
      raw_text: i.raw_text ?? null,
      confidence: i.confidence,
    })),
    subtotal: read.subtotal ?? null,
    gst: read.gst ?? null,
    total: read.total ?? null,
    discount: read.discount ?? null,
    freight: read.freight ?? null,
    adjustments: read.adjustments ?? null,
    notes: read.notes,
  };
}

/** Distinct names the library save keeps after merging repeats. */
export function libraryNameCount(read: ScanPage): number {
  return mergeRepeatedNames(
    read.items.map((i) => ({
      name: i.name,
      unit: i.unit,
      default_unit_price: i.price,
      sku: i.sku,
      supplier: null,
      supplier_url: null,
      notes: null,
      confidence: i.confidence,
    })),
    keepMoreReliable,
  ).rows.length;
}

/** Every difference between what was read and the exact answer (empty = right). */
export function supplierCaseDifferences(c: SupplierQuoteCase, read: ScanPage): string[] {
  const out: string[] = [];
  if (read.items.length !== c.lines.length) {
    out.push(`read ${read.items.length} lines, expected ${c.lines.length}: ${read.items.map((i) => i.name).join(" | ")}`);
  }
  c.lines.forEach((want, i) => {
    const got = read.items[i];
    if (!got) return;
    const label = `line ${i + 1} (${want.name.join(" ")})`;
    const name = got.name.toLowerCase();
    if (!want.name.every((w) => name.includes(w.toLowerCase()))) out.push(`${label}: name "${got.name}"`);
    if (got.quantity !== want.quantity) out.push(`${label}: quantity ${got.quantity} ≠ ${want.quantity}`);
    if (!want.unit.includes(got.unit)) out.push(`${label}: unit "${got.unit}" not in ${want.unit.join("/")}`);
    if (!cents(got.price, want.price)) out.push(`${label}: net unit price ${money(got.price)} ≠ ${money(want.price)}`);
    if (!cents(got.source_line_total, want.lineTotal)) {
      out.push(`${label}: line total ${money(got.source_line_total)} ≠ ${money(want.lineTotal)}`);
    }
  });
  if (read.gst_inclusive !== c.gstInclusive) out.push(`gst_inclusive ${read.gst_inclusive} ≠ ${c.gstInclusive}`);
  const t = c.totals;
  if (t.subtotal === null ? read.subtotal != null : !cents(read.subtotal, t.subtotal)) {
    out.push(`subtotal ${money(read.subtotal)} ≠ ${money(t.subtotal)}`);
  }
  if (!cents(read.gst, t.gst)) out.push(`GST ${money(read.gst)} ≠ ${money(t.gst)}`);
  if (!cents(read.total, t.total)) out.push(`total ${money(read.total)} ≠ ${money(t.total)}`);
  if (t.discount !== undefined ? !cents(read.discount, t.discount) : read.discount != null) {
    out.push(`discount ${money(read.discount)} ≠ ${money(t.discount)}`);
  }
  if (t.freight !== undefined ? !cents(read.freight, t.freight) : read.freight != null) {
    out.push(`freight ${money(read.freight)} ≠ ${money(t.freight)}`);
  }
  const report = validateSupplierQuote(asExtraction(read));
  if (report.blocking) out.push(`does not reconcile: ${report.reconciliation_reasons.join("; ")}`);
  if (c.libraryNames !== undefined) {
    const names = libraryNameCount(read);
    if (names !== c.libraryNames) out.push(`library save keeps ${names} names, expected ${c.libraryNames}`);
  }
  return out;
}
