// Client-safe: spot the same photo added twice to a supplier-quote scan
// BEFORE it is uploaded, by hashing the prepared (re-encoded) image bytes.
// Scanning both copies used to double every line and every printed total,
// so reconciliation still said "ok". A page photographed twice (different
// bytes, same content) is caught later by mergeExtractions.

/** Hex SHA-256 of a file/blob's bytes (Web Crypto — browsers and Node). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Tracks the photos already in a scan. `check` returns the 1-based number of
 * the earlier identical photo, or null (and remembers this one) when new.
 */
export function createPhotoDeduper() {
  const seen = new Map<string, number>();
  return {
    async check(blob: Blob, photoNumber: number): Promise<number | null> {
      const hash = await sha256Hex(blob);
      const first = seen.get(hash);
      if (first !== undefined) return first;
      seen.set(hash, photoNumber);
      return null;
    },
  };
}
