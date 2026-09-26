export const MAX_SCAN_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_SCAN_SOURCE_BYTES = 30 * 1024 * 1024;

export const PREPARED_SCAN_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export const SCAN_IMAGE_ACCEPT =
  "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif";

type SupportedSourceMime =
  | (typeof PREPARED_SCAN_MIME)[number]
  | "image/heic"
  | "image/heif";

const MIME_BY_EXTENSION: Record<string, SupportedSourceMime> = {
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

const GENERIC_MIME = new Set([
  "application/octet-stream",
  "binary/octet-stream",
  "application/binary",
]);

export function normaliseImageMime(
  type: string | null | undefined,
): string | null {
  const lower = (type ?? "").trim().toLowerCase();
  if (!lower) return null;
  return lower === "image/jpg" ? "image/jpeg" : lower;
}

function extensionFromName(name: string | null | undefined): string | null {
  const match = (name ?? "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

export function detectImageMime(
  file: Pick<File, "name" | "type">,
): string | null {
  const normalised = normaliseImageMime(file.type);
  const ext = extensionFromName(file.name);
  if (normalised && !GENERIC_MIME.has(normalised)) return normalised;
  return ext ? (MIME_BY_EXTENSION[ext] ?? null) : null;
}

export function isPreparedScanMime(mime: string | null | undefined): boolean {
  const normalised = normaliseImageMime(mime);
  return (
    normalised != null &&
    PREPARED_SCAN_MIME.some((m) => normaliseImageMime(m) === normalised)
  );
}

export function isHeicMime(mime: string | null | undefined): boolean {
  const normalised = normaliseImageMime(mime);
  return normalised === "image/heic" || normalised === "image/heif";
}

export function isSupportedScanInput(file: Pick<File, "name" | "type">): boolean {
  const mime = detectImageMime(file);
  return isPreparedScanMime(mime) || isHeicMime(mime);
}

export function scanUploadSizeError(file: Pick<File, "size">): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_SCAN_SOURCE_BYTES) {
    return `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max 30 MB before compression.`;
  }
  return null;
}

export function sniffPreparedImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }
  return null;
}

/** Supplier PDFs (quotes, invoices, price lists) go to the reader whole. */
export const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 20;

/**
 * The "choose a file" picker for supplier documents: photos and PDFs, so an
 * iPhone offers the Files app as well as Photos. (The camera input stays
 * images only.)
 */
export const SCAN_DOC_ACCEPT = `image/*,.heic,.heif,application/pdf,.pdf`;

/** A PDF by its type or name (octet-stream uploads from Files carry only the name). */
export function isPdfFile(file: Pick<File, "name" | "type">): boolean {
  const type = normaliseImageMime(file.type);
  if (type === "application/pdf") return true;
  if (type && !GENERIC_MIME.has(type)) return false;
  return extensionFromName(file.name) === "pdf";
}

/** "%PDF-" in the first kilobyte (some writers put a few bytes before it). */
export function sniffPdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, Math.min(bytes.length, 1024));
  for (let i = 0; i + 4 < head.length; i++) {
    if (head[i] === 0x25 && head[i + 1] === 0x50 && head[i + 2] === 0x44 && head[i + 3] === 0x46 && head[i + 4] === 0x2d) {
      return true;
    }
  }
  return false;
}

export function pdfUploadSizeError(file: Pick<File, "size">): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_PDF_UPLOAD_BYTES) {
    return `PDF is ${(file.size / 1024 / 1024).toFixed(1)} MB. Send PDFs up to ${MAX_PDF_UPLOAD_BYTES / 1024 / 1024} MB — split a bigger one into parts.`;
  }
  return null;
}
