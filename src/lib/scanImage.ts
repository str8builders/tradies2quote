// Client-only image prep for the AI scan uploads.
//
// Three problems this solves before an image is POSTed:
//   1. iPhones shoot HEIC, which Claude's vision API can't read — convert
//      to JPEG (heic2any, dynamically imported so it only loads when a HEIC
//      is actually picked).
//   2. Request bodies have a size limit and phone photos routinely exceed
//      it — so we downscale and re-encode. A 2000px JPEG is plenty for the
//      model to read the dimension labels, and lands well under the limit.
//   3. Camera photos carry EXIF, including the GPS position of the site. We
//      ALWAYS re-encode through a canvas — even a small JPEG — so that
//      metadata never leaves the device. (The server strips it again before
//      any AI call; this keeps it off the wire too.)
//
// All of this runs in the browser; the server still just receives a JPEG
// (or a PNG for a small drawing/screenshot, kept lossless).

import { detectImageMime, isHeicMime, isPreparedScanMime } from "@/lib/imageUpload";

/** PNGs up to this size stay lossless PNG; bigger ones (and photos) → JPEG. */
const PREP_OVER_BYTES = 3_500_000;
const MAX_DIM = 2000;
const JPEG_QUALITY = 0.8;

/** True if the file looks like an Apple HEIC/HEIF image. */
export function isHeic(file: File): boolean {
  return isHeicMime(detectImageMime(file));
}

/**
 * Whether the file needs preparing before upload. Every supported image
 * does now: re-encoding is what drops camera EXIF/GPS.
 */
export function needsPrep(file: File): boolean {
  return isHeic(file) || isPreparedScanMime(detectImageMime(file));
}

async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  // heic2any returns a Blob, or Blob[] for multi-image HEICs — take the first.
  const blob = Array.isArray(out) ? out[0] : out;
  const name = (file.name || "photo").replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

/**
 * Decode, fit inside MAX_DIM, and re-encode — always, whatever the size.
 * Returns the input untouched only if the browser can't decode/encode it
 * (the server re-encodes before any AI call regardless).
 */
async function reencode(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || MAX_DIM;
    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // A small PNG (drawing, screenshot) stays lossless; everything else is a
    // JPEG. JPEG has no alpha, so lay down white first — otherwise a
    // transparent background turns black.
    const keepPng = detectImageMime(file) === "image/png" && file.size <= PREP_OVER_BYTES;
    if (!keepPng) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const type = keepPng ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      keepPng
        ? canvas.toBlob((b) => resolve(b), type)
        : canvas.toBlob((b) => resolve(b), type, JPEG_QUALITY),
    );
    if (!blob) return file;
    const name = (file.name || "photo").replace(/\.\w+$/, "") + (keepPng ? ".png" : ".jpg");
    return new File([blob], name, { type });
  } catch {
    return file; // fall back to the original; size checks + the server guard
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare a user-picked image for a scan upload: convert HEIC → JPEG if
 * needed, then re-encode (dropping EXIF/GPS) and downscale/compress so it
 * clears the request-body limit. Throws only if a large or HEIC image
 * genuinely can't be decoded.
 */
export async function prepareScanImage(file: File): Promise<File> {
  const jpeg = isHeic(file) ? await heicToJpeg(file) : file;
  const prepared = await reencode(jpeg);
  if (jpeg.size > PREP_OVER_BYTES && prepared.size > PREP_OVER_BYTES) {
    throw new Error("image_prepare_failed");
  }
  return prepared;
}
