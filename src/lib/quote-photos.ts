import sharp from "sharp";
export const PHOTO_BUCKET = "quote-attachments";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
/** Decode and re-encode: reject disguised files, cap dimensions, strip GPS/EXIF. */
export async function normaliseQuotePhoto(bytes: Uint8Array): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new Error("Choose a photo under 10 MB.");
  const input = Buffer.from(bytes);
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Choose a still JPEG, PNG or WebP photo.");
  return image.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}
