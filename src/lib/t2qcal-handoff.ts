import { createHash, randomBytes } from "node:crypto";

/**
 * One-tap sign-in from Tradies2Quote into the T2QCAL app.
 *
 * The code never travels in a t2qcal:// link (any app may register that
 * scheme): the Tradies2Quote iPhone app puts it in a pasteboard only the
 * owner's own apps can read, and T2QCAL redeems it once, within
 * HANDOFF_TTL_MS, for a session of the same account. Only the code's SHA-256
 * is stored (public.t2qcal_handoffs).
 */
export const HANDOFF_TTL_MS = 60_000;

export function newHandoffCode(): string {
  return randomBytes(32).toString("base64url");
}

export function handoffCodeHash(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** A code as newHandoffCode makes it (43 base64url characters), or null. */
export function parseHandoffCode(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}
