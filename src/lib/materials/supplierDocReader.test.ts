import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  PRICE_LIST_PAGES_PER_READ,
  QUOTE_SYSTEM_PROMPT,
  inspectSupplierPdf,
  readSupplierDocument,
} from "./supplierDocReader";

// The reader behind the scan route and the golden eval, with the model
// replaced by an injected fetch (no network, no paid calls).

async function pdfWithPages(pages: number): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 780, size: 12 });
  return new Uint8Array(await doc.save());
}

function reply(body: unknown) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(body) }], stop_reason: "end_turn" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type Sent = { messages: Array<{ content: Array<{ type: string; text?: string; source?: { data: string } }> }> };

describe("readSupplierDocument — long PDF price lists", () => {
  it(`reads ${PRICE_LIST_PAGES_PER_READ} pages per call, all at once, and keeps page order`, async () => {
    const pdf = await pdfWithPages(9);
    const pagesSent: number[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Sent;
      const [doc, text] = body.messages[0].content;
      const part = await PDFDocument.load(Buffer.from(doc.source!.data, "base64"));
      pagesSent.push(part.getPageCount());
      const first = Number(text.text?.match(/pages? (\d+)/)?.[1]);
      return reply({
        supplier: "Kauri Timber Supplies",
        gst_inclusive: false,
        items: [{ name: `Item from page ${first}`, unit: "m", price: first, sku: null, confidence: 0.9 }],
        notes: [],
      });
    });
    const r = await readSupplierDocument({
      apiKey: "test",
      doc: { kind: "pdf", data: pdf, pages: 9 },
      mode: "price_list",
      deadlineAt: Date.now() + 85_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!r.ok) throw new Error(r.body.error);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(pagesSent.sort()).toEqual([1, 4, 4]);
    expect(r.value.items.map((i) => i.name)).toEqual(["Item from page 1", "Item from page 5", "Item from page 9"]);
    expect(r.status).toBe("ok");
    expect(r.attempts).toBe(3);
  });

  it("keeps the parts that were read when one part fails, and says which", async () => {
    const pdf = await pdfWithPages(8);
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const text = (JSON.parse(String(init?.body)) as Sent).messages[0].content[1].text ?? "";
      if (/pages 5/.test(text)) return new Response('{"error":{"type":"invalid_request_error"}}', { status: 400 });
      return reply({ supplier: null, gst_inclusive: null, items: [{ name: "Pine", unit: "m", price: 4.85, sku: null, confidence: 0.9 }], notes: [] });
    });
    const r = await readSupplierDocument({
      apiKey: "test",
      doc: { kind: "pdf", data: pdf, pages: 8 },
      mode: "price_list",
      deadlineAt: Date.now() + 85_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    if (!r.ok) throw new Error(r.body.error);
    expect(r.value.items).toHaveLength(1);
    expect(r.status).toBe("needs_review");
    expect(r.warnings.join(" ")).toMatch(/Pages 5–8 couldn't be read/);
  });
});

describe("readSupplierDocument — quotes", () => {
  it("asks for the NET unit price and the totals-block freight and discount", () => {
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/NETT unit price as printed, never the list price/);
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/"freight": number \| null/);
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/"discount": number \| null/);
    expect(QUOTE_SYSTEM_PROMPT).toMatch(/never compute or "fix" a printed number/);
  });

  it("does not start a read with no time left", async () => {
    const fetchImpl = vi.fn();
    const r = await readSupplierDocument({
      apiKey: "test",
      doc: { kind: "pdf", data: await pdfWithPages(1), pages: 1 },
      mode: "quote",
      deadlineAt: Date.now() + 5_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(504);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("inspectSupplierPdf", () => {
  it("counts pages and refuses a locked or oversize PDF", async () => {
    expect(await inspectSupplierPdf(await pdfWithPages(3))).toEqual({ ok: true, pages: 3 });
    expect(await inspectSupplierPdf(await pdfWithPages(21))).toMatchObject({ ok: false, status: 413 });
    expect(await inspectSupplierPdf(new TextEncoder().encode("not a pdf"))).toMatchObject({ ok: false, status: 415 });
  });
});
