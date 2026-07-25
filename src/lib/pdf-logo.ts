import "server-only";
import type { PDFDocument, PDFPage } from "pdf-lib";
import { fetchWithTimeout, TIMEOUTS } from "./fetchTimeout";
import { sniffPreparedImageMime } from "./imageUpload";

/**
 * A logo loaded and ready for pdf-lib. `mime` is narrowed to the two formats
 * pdf-lib can embed (`embedPng` / `embedJpg`) — webp/gif/unknown are rejected
 * upstream by returning null.
 */
export type PdfLogo = { bytes: Uint8Array; mime: "image/png" | "image/jpeg" };

/**
 * Fetch a tradie's `logo_url` and return embeddable bytes for the PDF header,
 * or null if there's no usable logo. NEVER throws — a logo is decoration, and
 * a broken/slow/missing one must never fail quote or invoice generation.
 *
 * Hardening (mirrors the public /api/quote/[token]/logo route):
 *   - Only fetches OUR Supabase storage origin. `logo_url` is a profile field;
 *     even though we only ever write our own storage URL into it, treating it
 *     as untrusted stops a tampered value turning PDF generation into an SSRF.
 *   - Bounded by the `short` fetch timeout so a hung storage host can't stall
 *     the whole request.
 *   - Byte-sniffs the payload; only PNG/JPEG (the formats pdf-lib embeds) pass.
 */
export async function loadLogoForPdf(
  logoUrl: string | null | undefined,
): Promise<PdfLogo | null> {
  if (!logoUrl || !/^https?:\/\//i.test(logoUrl)) return null;

  const allowedOrigin = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
      ).origin;
    } catch {
      return null;
    }
  })();
  if (!allowedOrigin) return null;

  let target: URL;
  try {
    target = new URL(logoUrl);
  } catch {
    return null;
  }
  if (target.origin !== allowedOrigin) return null;

  try {
    const res = await fetchWithTimeout(target.href, {}, TIMEOUTS.short);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const mime = sniffPreparedImageMime(bytes);
    if (mime === "image/png" || mime === "image/jpeg") return { bytes, mime };
    return null;
  } catch {
    return null;
  }
}

/** Max letterhead logo footprint (points). Aspect-fitted inside this box. */
const LOGO_MAX_W = 150;
const LOGO_MAX_H = 46;
/** Gap below the logo before the business name (points). */
const LOGO_GAP = 12;

/**
 * Draw the tradie's logo top-left of a PDF letterhead, aspect-fitted (never
 * upscaled) inside a {@link LOGO_MAX_W}×{@link LOGO_MAX_H} box with its top edge
 * at `topY`. Returns the vertical space consumed (logo height + gap) so the
 * caller can push the business name down, or 0 when there's no logo / embedding
 * fails. NEVER throws — the letterhead renders with or without the mark.
 *
 * Shared by both `pdf-generator.ts` (quotes) and `invoice-pdf-generator.ts`
 * (invoices) so the two documents place branding identically.
 */
export async function drawPdfLogo(
  pdf: PDFDocument,
  page: PDFPage,
  logo: PdfLogo | null | undefined,
  x: number,
  topY: number,
): Promise<number> {
  if (!logo) return 0;
  try {
    const img =
      logo.mime === "image/png"
        ? await pdf.embedPng(logo.bytes)
        : await pdf.embedJpg(logo.bytes);
    const scale = Math.min(LOGO_MAX_W / img.width, LOGO_MAX_H / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x, y: topY - h, width: w, height: h });
    return h + LOGO_GAP;
  } catch {
    return 0;
  }
}
