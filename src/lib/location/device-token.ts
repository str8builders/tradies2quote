import "server-only";
import { createHash, randomBytes } from "node:crypto";

/**
 * The iPhone app's upload key for the route while it's in the background.
 * Only the SHA-256 is stored (location_devices.token_hash); the key lives in
 * the phone's keychain.
 */
export function createDeviceToken(): { token: string; hash: string } {
  const token = `t2qloc_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDeviceToken(token) };
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A well-formed key, before touching the database. */
export function looksLikeDeviceToken(value: string | null | undefined): value is string {
  return typeof value === "string" && /^t2qloc_[A-Za-z0-9_-]{43}$/.test(value);
}
