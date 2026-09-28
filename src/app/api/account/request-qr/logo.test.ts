import { describe, expect, it, vi } from "vitest";
import { allowedQrLogoUrl, fetchQrLogo, MAX_LOGO_BYTES, readCappedBody } from "./logo";

/**
 * The request-link QR code pastes the business logo in. logo_url is
 * writable through the REST API, so it must never make the server fetch
 * anything but our own public business-logos objects (audit 2026-09-28:
 * SSRF, including via redirects).
 */

const SUPABASE = "https://api.tradies2quote.com";
const LOGO = `${SUPABASE}/storage/v1/object/public/business-logos/0f7f4f6e-1111-4222-8333-944444444444/1727000000.png`;

describe("allowedQrLogoUrl", () => {
  it("allows our own public business-logos objects", () => {
    expect(allowedQrLogoUrl(LOGO, SUPABASE)).toBe(LOGO);
  });

  it.each([
    ["an internal service", "http://127.0.0.1:3001/api/internal/secret"],
    ["the metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
    ["another site", "https://evil.example/logo.png"],
    ["a look-alike host", "https://api.tradies2quote.com.evil.example/storage/v1/object/public/business-logos/x.png"],
    ["another port", "https://api.tradies2quote.com:8443/storage/v1/object/public/business-logos/x.png"],
    ["plain http", "http://api.tradies2quote.com/storage/v1/object/public/business-logos/x.png"],
    ["another bucket", `${SUPABASE}/storage/v1/object/public/quote-pdfs/u/q.pdf`],
    ["the REST API", `${SUPABASE}/rest/v1/profiles?select=*`],
    ["a path trick", `${SUPABASE}/storage/v1/object/public/business-logos/..%2f..%2frest/v1/profiles`],
    ["credentials", "https://user:pass@api.tradies2quote.com/storage/v1/object/public/business-logos/x.png"],
    ["the bucket itself", `${SUPABASE}/storage/v1/object/public/business-logos/`],
  ])("refuses %s", (_what, url) => {
    expect(allowedQrLogoUrl(url, SUPABASE)).toBeNull();
  });

  it("refuses junk and a missing storage URL", () => {
    expect(allowedQrLogoUrl(null, SUPABASE)).toBeNull();
    expect(allowedQrLogoUrl("not a url", SUPABASE)).toBeNull();
    expect(allowedQrLogoUrl(LOGO, null)).toBeNull();
  });
});

describe("fetchQrLogo", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

  it("fetches an allowed logo without following redirects", async () => {
    const fetchImpl = vi.fn(async () => new Response(png, { status: 200 }));
    expect(await fetchQrLogo(LOGO, SUPABASE, fetchImpl as unknown as typeof fetch)).toEqual(Buffer.from(png));
    expect(fetchImpl).toHaveBeenCalledWith(LOGO, expect.objectContaining({ redirect: "error" }));
  });

  it("never fetches a URL that isn't ours", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchQrLogo("http://127.0.0.1:5432/", SUPABASE, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a redirect (which fetch refuses) or an error status gives the plain code", async () => {
    const redirected = vi.fn(async () => {
      throw new TypeError("fetch failed: unexpected redirect");
    });
    expect(await fetchQrLogo(LOGO, SUPABASE, redirected as unknown as typeof fetch)).toBeNull();
    const missing = vi.fn(async () => new Response("nope", { status: 404 }));
    expect(await fetchQrLogo(LOGO, SUPABASE, missing as unknown as typeof fetch)).toBeNull();
  });
});

describe("readCappedBody", () => {
  it("refuses a body that says it is too big", async () => {
    const res = new Response("x", { headers: { "content-length": String(MAX_LOGO_BYTES + 1) } });
    expect(await readCappedBody(res)).toBeNull();
  });

  it("stops reading a body that turns out too big", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(new Uint8Array(1024));
        controller.close();
      },
    });
    expect(await readCappedBody(new Response(stream), 3000)).toBeNull();
  });

  it("keeps a body within the cap", async () => {
    expect(await readCappedBody(new Response(new Uint8Array(10)), 3000)).toHaveLength(10);
  });
});
