import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { drawPdfLogo, loadLogoForPdf } from "./pdf-logo";

// A valid 1×1 PNG (red pixel), decoded from base64.
const PNG_1x1 = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

describe("drawPdfLogo", () => {
  it("returns 0 when there is no logo", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    expect(await drawPdfLogo(pdf, page, null, 48, 800)).toBe(0);
    expect(await drawPdfLogo(pdf, page, undefined, 48, 800)).toBe(0);
  });

  it("embeds a PNG and reports the consumed height, and the PDF saves", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const drop = await drawPdfLogo(
      pdf,
      page,
      { bytes: PNG_1x1, mime: "image/png" },
      48,
      800,
    );
    expect(drop).toBeGreaterThan(0);
    const bytes = await pdf.save();
    expect(bytes.length).toBeGreaterThan(0);
  });

  it("never throws on undecodable bytes — returns 0 so the PDF still renders", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const drop = await drawPdfLogo(
      pdf,
      page,
      { bytes: new Uint8Array([1, 2, 3, 4, 5]), mime: "image/png" },
      48,
      800,
    );
    expect(drop).toBe(0);
  });
});

describe("loadLogoForPdf — SSRF guard", () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://store.example.supabase.co";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  });

  it("returns null for empty / non-http / malformed input (no fetch)", async () => {
    expect(await loadLogoForPdf(null)).toBeNull();
    expect(await loadLogoForPdf(undefined)).toBeNull();
    expect(await loadLogoForPdf("")).toBeNull();
    expect(await loadLogoForPdf("not-a-url")).toBeNull();
    expect(await loadLogoForPdf("ftp://store.example.supabase.co/x.png")).toBeNull();
  });

  it("refuses any origin other than our Supabase host (no fetch)", async () => {
    expect(
      await loadLogoForPdf("https://evil.example.com/logo.png"),
    ).toBeNull();
  });
});
