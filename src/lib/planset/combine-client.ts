// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — prepare picked files in the browser (images → JPEG/PNG,
// HEIC converted, camera EXIF/GPS dropped, capped at 4,000 px so small print
// on a photographed A1 sheet stays readable), then combine them (combine.ts).
// A single PDF is uploaded exactly as picked: no re-saving a 40 MB set.
// ─────────────────────────────────────────────────────────────────────────

import { combinePlanParts, planFileKind, PlanFileError, type PlanPart } from "./combine";

const MAX_IMAGE_DIM = 4000;
const JPEG_QUALITY = 0.85;

async function heicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

/** Decode, fit inside MAX_IMAGE_DIM, re-encode (drops EXIF/GPS). */
async function imagePart(file: File): Promise<PlanPart> {
  const source = planFileKind(file) === "heic" ? await heicToJpeg(file) : file;
  const url = URL.createObjectURL(source);
  try {
    const img = document.createElement("img");
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new PlanFileError(`${file.name} couldn't be opened as a picture.`));
      img.src = url;
    });
    const longest = Math.max(img.naturalWidth, img.naturalHeight) || MAX_IMAGE_DIM;
    const scale = longest > MAX_IMAGE_DIM ? MAX_IMAGE_DIM / longest : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new PlanFileError(`${file.name} couldn't be prepared on this device.`);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new PlanFileError(`${file.name} couldn't be prepared on this device.`);
    return { kind: "image", name: file.name, bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/jpeg", width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * The file to upload for these picks: the single PDF as it is, or everything
 * combined into one PDF (pages in the order picked).
 */
export async function planUploadFile(files: readonly File[], onStep?: (step: string) => void): Promise<File> {
  if (files.length === 1 && planFileKind(files[0]) === "pdf") return files[0];
  const parts: PlanPart[] = [];
  for (const [i, file] of files.entries()) {
    onStep?.(`Preparing ${i + 1} of ${files.length}: ${file.name}`);
    if (planFileKind(file) === "pdf") parts.push({ kind: "pdf", name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    else parts.push(await imagePart(file));
  }
  onStep?.("Putting the pages together");
  const combined = await combinePlanParts(parts);
  return new File([combined.pdf as BlobPart], "combined.pdf", { type: "application/pdf" });
}
