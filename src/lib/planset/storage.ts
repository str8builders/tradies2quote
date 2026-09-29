// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — where the uploaded PDF lives, and the limits (pure).
// Same private bucket as the per-sheet plan reader; the {uid}/ prefix is
// what the bucket's RLS policy checks.
// ─────────────────────────────────────────────────────────────────────────

export { PLAN_BUCKET } from "@/lib/planreader/storage";

/** The storage server's own cap (FILE_SIZE_LIMIT) — the bucket is raised to match. */
export const MAX_SET_BYTES = 50 * 1024 * 1024;

/** Sheets read from one set. The owner's biggest real set is 49 A1 sheets. */
export const MAX_SET_PAGES = 120;

/** Storage path for a set's original PDF. */
export function setPdfPath(userId: string, setId: string): string {
  return `${userId}/sets/${setId}/original.pdf`;
}

/** Does this look like a PDF file (the %PDF- header)? */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}
