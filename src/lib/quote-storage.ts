import "server-only";
import { randomUUID } from "node:crypto";
import { adminClient } from "./supabase/admin";

const PDF_BUCKET = "quote-pdfs";
const SIGNATURE_BUCKET = "signatures";

/**
 * Layout of the send-time PDFs stored now. Files stored by an older layout
 * (the legacy `${userId}/${quoteId}.pdf`, which printed the private markup,
 * "?" for £ and accents, and a different valid-until date) are re-rendered by
 * the public PDF route instead of served. Bump when the quote PDF's content
 * changes in a way a client must not keep seeing.
 */
export const PDF_LAYOUT = 2;

/** Where a quote's send-time PDF is stored. */
export function pdfPath(userId: string, quoteId: string): string {
  return `${userId}/${quoteId}/quote-v${PDF_LAYOUT}.pdf`;
}

function legacyPdfPath(userId: string, quoteId: string): string {
  return `${userId}/${quoteId}.pdf`;
}

/** One plain file name: no folders, no "..", not empty. */
function isPlainFileName(name: string): boolean {
  return name.length > 0 && !/[\\/]/.test(name) && !name.includes("..");
}

/**
 * True when `path` is one of this quote's own stored PDFs (current or older
 * layout). Quote rows are writable by their owner, so the service-role
 * download must never follow a path that points anywhere else.
 */
export function isOwnPdfPath(userId: string, quoteId: string, path: string | null | undefined): boolean {
  if (!path || !userId || !quoteId) return false;
  if (path === legacyPdfPath(userId, quoteId)) return true;
  const folder = `${userId}/${quoteId}/`;
  return path.startsWith(folder) && isPlainFileName(path.slice(folder.length));
}

/** True when `path` was stored by the current PDF layout for this quote. */
export function isCurrentLayoutPdfPath(userId: string, quoteId: string, path: string | null | undefined): boolean {
  return !!path && path === pdfPath(userId, quoteId);
}

/**
 * A new signature file for one acceptance attempt. Every attempt gets its own
 * name, so two overlapping accepts never write the same file, and the one
 * that loses can only ever delete its own.
 */
export function signaturePath(quoteId: string, attempt: string = randomUUID()): string {
  return `${quoteId}/signature-${attempt}.png`;
}

/** True when `path` is a signature stored for this quote (any attempt, or the older fixed name). */
export function isOwnSignaturePath(quoteId: string, path: string | null | undefined): boolean {
  if (!path || !quoteId) return false;
  const folder = `${quoteId}/`;
  return path.startsWith(folder) && isPlainFileName(path.slice(folder.length));
}

export async function uploadPdf(
  userId: string,
  quoteId: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = pdfPath(userId, quoteId);
  const supabase = adminClient();
  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    throw new Error(`Failed to upload PDF: ${error.message}`);
  }
  return path;
}

/** Store one acceptance attempt's signature under its own new name; never overwrites. */
export async function uploadSignature(
  quoteId: string,
  bytes: Uint8Array,
): Promise<string> {
  const path = signaturePath(quoteId);
  const supabase = adminClient();
  const { error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .upload(path, bytes, {
      contentType: "image/png",
      upsert: false,
    });
  if (error) {
    throw new Error(`Failed to upload signature: ${error.message}`);
  }
  return path;
}

export async function downloadPdf(path: string): Promise<Uint8Array> {
  const supabase = adminClient();
  const { data, error } = await supabase.storage.from(PDF_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Failed to download PDF: ${error?.message ?? "no data"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function downloadSignature(path: string): Promise<Uint8Array> {
  const supabase = adminClient();
  const { data, error } = await supabase.storage
    .from(SIGNATURE_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(
      `Failed to download signature: ${error?.message ?? "no data"}`,
    );
  }
  return new Uint8Array(await data.arrayBuffer());
}
