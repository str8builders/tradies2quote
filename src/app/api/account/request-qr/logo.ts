/**
 * The business logo pasted into the request-link QR code.
 *
 * profiles.logo_url is writable by the tradie through the REST API, so it is
 * untrusted: the old check (starts with https://) let a URL — or a redirect
 * from it — reach services on the server's own network (e.g.
 * http://127.0.0.1:<port>), with the answer pasted into the PNG. Now only a
 * public object in OUR `business-logos` storage bucket is fetched (the same
 * rule as quote videos and PDFs), redirects are refused, and the download is
 * capped at the bucket's own 8 MB limit.
 */

/** business-logos bucket limit (supabase/migrations/20260924_public_bucket_limits.sql). */
export const MAX_LOGO_BYTES = 8 * 1024 * 1024;
/** Decoding cap for sharp: far above any real logo, well below a pixel bomb. */
export const MAX_LOGO_PIXELS = 40_000_000;

/** The logo URL when it's a public object in our business-logos bucket, else null. */
export function allowedQrLogoUrl(logoUrl: unknown, supabaseUrl: string | null | undefined): string | null {
  if (typeof logoUrl !== "string" || !supabaseUrl) return null;
  let base: URL;
  let target: URL;
  try {
    base = new URL(supabaseUrl);
    target = new URL(logoUrl);
  } catch {
    return null;
  }
  if (target.origin !== base.origin || target.username || target.password) return null;
  const prefix = `${base.pathname.replace(/\/+$/, "")}/storage/v1/object/public/business-logos/`;
  if (!target.pathname.startsWith(prefix) || target.pathname.length === prefix.length) return null;
  if (/\/\.\.?(\/|$)|%2e|%2f|%5c/i.test(target.pathname)) return null;
  return target.href;
}

/** The response body, or null if it is (or says it is) bigger than `cap` bytes. */
export async function readCappedBody(res: Response, cap: number = MAX_LOGO_BYTES): Promise<Buffer | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch the logo: our storage origin only, no redirects followed, bounded in
 * time and size. Null when there's no usable logo (the plain code is used).
 */
export async function fetchQrLogo(
  logoUrl: unknown,
  supabaseUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<Buffer | null> {
  const url = allowedQrLogoUrl(logoUrl, supabaseUrl);
  if (!url) return null;
  try {
    const res = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await readCappedBody(res);
  } catch {
    return null; // unreachable, redirected or too slow: plain code
  }
}
