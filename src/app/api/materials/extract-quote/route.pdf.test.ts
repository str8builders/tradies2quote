import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { NextRequest } from "next/server";

// The scan route with PDFs, price lists, the iPhone app's "paused" wording
// and the 90-second budget. The model is a fetch mock: no paid AI calls.

const h = vi.hoisted(() => ({
  ua: "",
  canWrite: true,
  fetch: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k.toLowerCase() === "user-agent" ? h.ua : null),
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "user-1", email: "tradie@example.invalid", created_at: "2026-09-01T00:00:00Z" } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const { AI_CONSENT_VERSION } = await vi.importActual<typeof import("@/lib/ai-consent")>("@/lib/ai-consent");
            return { data: { ai_consent_at: "2026-09-01T00:00:00Z", ai_consent_version: AI_CONSENT_VERSION }, error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/subscription", () => ({
  getSubscriptionStatus: async () => ({ state: h.canWrite ? "trialing" : "expired" }),
  canWrite: () => h.canWrite,
}));
vi.mock("@/lib/owner", () => ({ isOwnerEmail: () => true }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));

import { POST } from "./route";
import { MIN_RETRY_MS, TOO_SLOW_MESSAGE } from "@/lib/materials/supplierDocReader";
import { NEW_QUOTES_PAUSED } from "@/lib/trial-ended";

const NATIVE_UA = "Mozilla/5.0 (iPhone) Mobile/15E148 T2QNativeShell";
const WEB_UA = "Mozilla/5.0 (iPhone) Safari/604.1";

async function pdfWithPages(pages: number): Promise<Uint8Array<ArrayBuffer>> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`Page ${i + 1}`, { x: 50, y: 780, size: 12 });
  return new Uint8Array(await doc.save());
}

function post(file: File, fields: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return POST(new NextRequest("https://tradies2quote.com/api/materials/extract-quote", { method: "POST", body: form }));
}

const QUOTE = {
  supplier: "Kauri Timber Supplies",
  quote_number: "KT-1001",
  currency: "NZD",
  gst_inclusive: false,
  items: [{ name: "90x45 H1.2 SG8", unit: "m", quantity: 20, pieces: null, price: 4.85, line_total: 97, sku: null, raw_text: null, confidence: 0.95 }],
  subtotal: 97,
  gst: 14.55,
  total: 111.55,
  notes: [],
};

function anthropicOk(body: unknown) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text: JSON.stringify(body) }], stop_reason: "end_turn" }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

type SentBody = {
  system: string;
  messages: Array<{ content: Array<{ type: string; text?: string; source?: { media_type: string; data: string } }> }>;
};
const sent = (call: number): SentBody => JSON.parse(String(h.fetch.mock.calls[call][1]?.body)) as SentBody;

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubGlobal("fetch", h.fetch);
  h.fetch.mockReset();
  h.fetch.mockImplementation(async () => anthropicOk(QUOTE));
  h.ua = WEB_UA;
  h.canWrite = true;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PDF supplier quotes", () => {
  it("sends a PDF whole as a base64 document block, not an image", async () => {
    const pdf = await pdfWithPages(2);
    const res = await post(new File([pdf], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(200);
    const content = sent(0).messages[0].content;
    expect(content.map((c) => c.type)).toEqual(["document", "text"]);
    expect(content[0].source?.media_type).toBe("application/pdf");
    expect(Buffer.from(content[0].source!.data, "base64").equals(Buffer.from(pdf))).toBe(true);
    expect(content[1].text).toMatch(/every page/);
  });

  it("knows a PDF from its bytes when the phone sends it without a type", async () => {
    const pdf = await pdfWithPages(1);
    const res = await post(new File([pdf], "upload", { type: "application/octet-stream" }));
    expect(res.status).toBe(200);
    expect(sent(0).messages[0].content[0].type).toBe("document");
  });

  it("turns away a PDF over 20 pages before anything is sent", async () => {
    const res = await post(new File([await pdfWithPages(21)], "big.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/21 pages.*up to 20/);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("turns away a file called .pdf that isn't one, and one over 10 MB", async () => {
    const fake = await post(new File([new TextEncoder().encode("hello")], "quote.pdf", { type: "application/pdf" }));
    expect(fake.status).toBe(415);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    const tooBig = await post(new File([big], "quote.pdf", { type: "application/pdf" }));
    expect(tooBig.status).toBe(413);
    expect(h.fetch).not.toHaveBeenCalled();
  });
});

describe("price-list mode", () => {
  it("uses the price-list reader and doesn't ask for totals", async () => {
    h.fetch.mockImplementation(async () =>
      anthropicOk({
        supplier: "Kauri Timber Supplies",
        gst_inclusive: false,
        items: [{ name: "90x45 H1.2 SG8", unit: "m", price: 4.85, sku: "KT9045", confidence: 0.95 }],
        notes: [],
      }),
    );
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ffffff" } }).jpeg().toBuffer();
    const res = await post(new File([new Uint8Array(photo)], "list.jpg", { type: "image/jpeg" }), { mode: "price_list" });
    expect(res.status).toBe(200);
    expect(sent(0).system).toMatch(/PRICE LIST/);
    const data = (await res.json()) as { extraction_status: string; items: Array<{ sku: string }> };
    expect(data.extraction_status).toBe("ok");
    expect(data.items[0].sku).toBe("KT9045");
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});

describe("new quotes paused", () => {
  it("in the iPhone app says so plainly — no subscribing, plans or prices", async () => {
    h.ua = NATIVE_UA;
    h.canWrite = false;
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(402);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.message).toBe(NEW_QUOTES_PAUSED);
    expect(body.message).toBe("New quotes are paused on this account.");
    expect(body).not.toHaveProperty("upgrade_url");
    expect(JSON.stringify(body)).not.toMatch(/subscri|plan|price|\$|upgrade/i);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("on the web keeps the existing trial wording", async () => {
    h.canWrite = false;
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { message: string }).message).toMatch(/Subscribe/);
  });
});

describe("the 90-second budget", () => {
  // A row the reader couldn't read (a malformed price): worth a second read.
  const INCOMPLETE = {
    ...QUOTE,
    items: [...QUOTE.items, { name: "Joist hanger", unit: "each", quantity: 4, price: "3.9O", line_total: null, sku: null, raw_text: "4 @ 3.9O", confidence: 0.4 }],
  };

  function clock(start: number) {
    let t = start;
    vi.spyOn(Date, "now").mockImplementation(() => t);
    return { advance: (ms: number) => (t += ms) };
  }

  it("re-reads an incomplete quote when there is time", async () => {
    const c = clock(1_000_000);
    h.fetch.mockImplementation(async () => {
      c.advance(20_000);
      return anthropicOk(INCOMPLETE);
    });
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't re-read a page just because it prints no totals (page 1 of a longer quote)", async () => {
    h.fetch.mockImplementation(async () => anthropicOk({ ...QUOTE, subtotal: null, gst: null, total: null }));
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(((await res.json()) as { extraction_status: string }).extraction_status).toBe("needs_review");
  });

  it(`skips the re-read when less than ${MIN_RETRY_MS / 1000}s is left, keeping the first read`, async () => {
    const c = clock(1_000_000);
    h.fetch.mockImplementation(async () => {
      c.advance(60_000); // a slow first read: 25 s left of 85
      return anthropicOk(INCOMPLETE);
    });
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(200);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const data = (await res.json()) as { extraction_status: string; items: unknown[] };
    expect(data.extraction_status).toBe("needs_review");
    expect(data.items).toHaveLength(1);
  });

  it("answers a read that timed out with a plain 'clearer photo / fewer pages' message", async () => {
    h.fetch.mockImplementation(async () => {
      throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
    });
    const res = await post(new File([await pdfWithPages(1)], "quote.pdf", { type: "application/pdf" }));
    expect(res.status).toBe(504);
    expect(((await res.json()) as { error: string }).error).toBe(TOO_SLOW_MESSAGE);
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });
});
