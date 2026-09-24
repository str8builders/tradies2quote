import "server-only";
import sharp from "sharp";

/**
 * Re-encode an uploaded image before it is sent to ANY AI provider.
 *
 * Phone photos carry EXIF — including the GPS position of the job site (or
 * the tradie's home) — and small JPEGs used to be forwarded byte-for-byte.
 * Decoding and re-encoding with sharp drops every metadata block (EXIF/GPS,
 * XMP, IPTC, comments): sharp writes none unless asked to keep it. The EXIF
 * orientation is baked into the pixels first so the model still sees the
 * photo the right way up.
 *
 * JPEG stays JPEG (high quality). PNG / GIF / WebP-with-transparency become
 * PNG — lossless, so drawings and screenshots keep their sharp lines; other
 * WebP photos become JPEG. Dimensions are unchanged (the browser already
 * downscales scans; the provider resizes large images itself).
 */

export type AiImageMediaType = "image/jpeg" | "image/png";

export class UnreadableImageError extends Error {
  constructor() {
    super("Unsupported or unreadable image file.");
    this.name = "UnreadableImageError";
  }
}

/** Refuse decompression bombs: ~50 megapixels is far beyond any phone photo. */
const MAX_INPUT_PIXELS = 50_000_000;
const JPEG_QUALITY = 90;

export async function prepareImageForAi(
  bytes: Uint8Array,
): Promise<{ data: Buffer; mediaType: AiImageMediaType }> {
  try {
    const image = sharp(Buffer.from(bytes), {
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
    });
    const meta = await image.metadata();
    const oriented = image.autoOrient();
    const keepLossless =
      meta.format === "png" ||
      meta.format === "gif" ||
      (meta.format === "webp" && meta.hasAlpha === true);
    if (keepLossless) {
      return { data: await oriented.png().toBuffer(), mediaType: "image/png" };
    }
    return {
      data: await oriented.jpeg({ quality: JPEG_QUALITY }).toBuffer(),
      mediaType: "image/jpeg",
    };
  } catch {
    throw new UnreadableImageError();
  }
}
