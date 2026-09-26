/**
 * Checks on the supplier-quote golden cases that cost nothing (they run in
 * `npm test`): every fixture is there and opens, every exact answer adds up
 * on its own, and the eval's path — the route's upload preparation, the
 * reader, the page merge, the reconciliation and the scoring — passes when a
 * stand-in model answers perfectly. So a failure in `npm run eval:supplier`
 * means the model misread, not that the eval is wired wrong.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { round2 } from "@/lib/quote-defaults";
import { inspectSupplierPdf, prepareSupplierUpload } from "@/lib/materials/supplierDocReader";
import { SUPPLIER_QUOTE_CASES, type SupplierQuoteCase } from "./supplier-quote-cases";
import {
  SUPPLIER_FIXTURES,
  fixtureMime,
  readSupplierCase,
  supplierCaseDifferences,
} from "./supplier-quote-scoring";

/** What a model that read file `index` of the case perfectly would answer. */
function perfectReply(c: SupplierQuoteCase, index: number) {
  const split = c.linesPerFile ?? [c.lines.length];
  const start = split.slice(0, index).reduce((a, b) => a + b, 0);
  const lines = c.lines.slice(start, start + split[index]);
  const last = index === c.files.length - 1;
  return {
    supplier: "Test Supplier",
    quote_number: null,
    currency: "NZD",
    gst_inclusive: c.gstInclusive,
    items: lines.map((l) => ({
      name: l.name.join(" "),
      unit: l.unit[0],
      quantity: l.quantity,
      pieces: null,
      price: l.price,
      line_total: l.lineTotal,
      sku: null,
      raw_text: null,
      confidence: 0.95,
    })),
    subtotal: last ? c.totals.subtotal : null,
    discount: last && c.totals.discount !== undefined ? -c.totals.discount : null,
    freight: last ? (c.totals.freight ?? null) : null,
    adjustments: null,
    gst: last ? c.totals.gst : null,
    total: last ? c.totals.total : null,
    notes: [],
  };
}

describe("supplier-quote golden cases", () => {
  it.each(SUPPLIER_QUOTE_CASES)("$id: the fixture files are there and open", async (c) => {
    for (const file of c.files) {
      const path = resolve(SUPPLIER_FIXTURES, file);
      expect(existsSync(path), `${file} — run node scripts/make-supplier-fixtures.mjs`).toBe(true);
      const bytes = new Uint8Array(readFileSync(path));
      const prepared = await prepareSupplierUpload(bytes, { name: file, type: fixtureMime(file) });
      expect(prepared.ok, file).toBe(true);
      if (file.endsWith(".pdf")) expect(await inspectSupplierPdf(bytes)).toEqual({ ok: true, pages: 1 });
    }
  });

  it.each(SUPPLIER_QUOTE_CASES)("$id: the exact answer adds up on its own", (c) => {
    for (const l of c.lines) expect(round2(l.quantity * l.price), l.name.join(" ")).toBe(l.lineTotal);
    const sum = round2(c.lines.reduce((s, l) => s + l.lineTotal, 0));
    if (c.totals.subtotal !== null) expect(sum).toBe(c.totals.subtotal);
    const net = round2(sum - (c.totals.discount ?? 0) + (c.totals.freight ?? 0));
    if (c.gstInclusive) {
      expect(c.totals.total).toBe(net);
      expect(Math.abs(round2(net - net / 1.15) - c.totals.gst)).toBeLessThanOrEqual(0.01);
    } else {
      expect(Math.abs(round2(net * 0.15) - c.totals.gst)).toBeLessThanOrEqual(0.01);
      expect(round2(net + c.totals.gst)).toBe(c.totals.total);
    }
  });

  it.each(SUPPLIER_QUOTE_CASES)("$id: the eval's path scores a perfect read as right", async (c) => {
    let call = 0;
    const sentKinds: string[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: Array<{ type: string }> }> };
      sentKinds.push(body.messages[0].content[0].type);
      const reply = perfectReply(c, call++);
      return new Response(
        JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const read = await readSupplierCase("test-key", c, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(supplierCaseDifferences(c, read)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(c.files.length);
    expect(sentKinds).toEqual(c.files.map((f) => (f.endsWith(".pdf") ? "document" : "image")));
  });

  it("the scoring catches a list price read as the price", async () => {
    const c = SUPPLIER_QUOTE_CASES[0];
    const fetchImpl = vi.fn(async () => {
      const reply = perfectReply(c, 0);
      reply.items[0] = { ...reply.items[0], price: 21.5 }; // the List column, not Nett
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }], stop_reason: "end_turn" }), {
        status: 200,
      });
    });
    const read = await readSupplierCase("test-key", c, { fetchImpl: fetchImpl as unknown as typeof fetch });
    const diffs = supplierCaseDifferences(c, read);
    expect(diffs.join("\n")).toMatch(/net unit price 21\.50 ≠ 18\.28/);
    expect(diffs.join("\n")).toMatch(/does not reconcile/);
  });
});
