// Client-only image prep shared by the avatar and business-logo uploads.
//
// The problem this solves is the same one `scanImage.ts` solves for AI scans,
// generalised for profile/branding images:
//   1. iPhones shoot HEIC, which our upload allow-list (jpg/png/webp) and
//      pdf-lib (jpg/png only) can't read — convert to JPEG (heic2any, lazily
//      imported so the ~1 MB decoder only loads when a HEIC is actually
//      picked).
//   2. A raw camera-roll photo is routinely 3–8 MB, which tripped the avatar
//      upload's 2 MB cap ("FILE IS OVER 2 MB"). Downscale + re-encode so a
//      normal phone photo lands in the tens-of-KB and the cap can never bite.
//
// Everything here runs in the browser; the server action still receives a
// plain JPEG/PNG and re-validates it. Both entry points are best-effort — on
// any decode failure they return the ORIGINAL file so the server-side
// validation (not a thrown error) decides the outcome.

import { detectImageMime, isHeicMime } from "@/lib/imageUpload";

/** True if the file looks like an Apple HEIC/HEIF image. */
function isHeic(file: File): boolean {
  return isHeicMime(detectImageMime(file));
}

async function heicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  // heic2any returns a Blob, or Blob[] for multi-image HEICs — take the first.
  const blob = Array.isArray(out) ? out[0] : out;
  const name = (file.name || "photo").replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

type EncodeMime = "image/jpeg" | "image/png";

/**
 * Decode `file`, fit it inside a `maxDim`×`maxDim` box (never upscaling), and
 * re-encode to `mime`. Always re-encodes — even a small file — so the output
 * mime is GUARANTEED to be jpg/png (never webp/heic/gif), which is exactly
 * what the storage allow-list and pdf-lib's `embedJpg`/`embedPng` require.
 * Returns the original file untouched if anything in the canvas path fails.
 */
async function reencode(
  file: File,
  maxDim: number,
  mime: EncodeMime,
  quality: number,
): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || maxDim;
    const scale = longest > maxDim ? maxDim / longest : 1;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha: transparent source pixels composite onto BLACK by
    // default, which turns a logo with a transparent background into a black
    // box on white paper. Lay down white first so flattened logos (and any
    // transparent avatar) land on white. Harmless for opaque sources. PNG
    // output keeps its alpha, so we skip the fill there.
    if (mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), mime, quality),
    );
    if (!blob) return file;
    const ext = mime === "image/png" ? "png" : "jpg";
    const name = (file.name || "image").replace(/\.\w+$/, "") + "." + ext;
    return new File([blob], name, { type: mime });
  } catch {
    return file; // fall back to the original; server validation still guards
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Prepare a user-picked avatar: HEIC → JPEG, then downscale to a 512 px square
 * box and JPEG-compress. A round profile photo needs nothing larger, and the
 * result is typically 30–120 KB — far under the server's size backstop.
 */
export async function prepareAvatarImage(file: File): Promise<File> {
  const base = isHeic(file) ? await heicToJpeg(file) : file;
  return reencode(base, 512, "image/jpeg", 0.82);
}

/**
 * Prepare a user-picked business logo: HEIC → JPEG, then fit inside a 1024 px
 * box. A PNG source is kept as PNG so a logo's transparent background survives
 * (letterhead on a white PDF); anything else normalises to JPEG. Either way
 * the output is a format both the storage bucket and pdf-lib accept.
 */
export async function prepareLogoImage(file: File): Promise<File> {
  const base = isHeic(file) ? await heicToJpeg(file) : file;
  const target: EncodeMime =
    detectImageMime(base) === "image/png" ? "image/png" : "image/jpeg";
  return reencode(base, 1024, target, 0.92);
}
