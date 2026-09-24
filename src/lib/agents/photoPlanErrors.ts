// Plain-English messages for a failed photo read (/api/agents/photo-plan).
// Client-safe. The route answers with machine codes ("trial_expired",
// "ai_consent_required", "rate_limited") and technical sentences; the
// tradie must never see those raw.

const FALLBACK = "Something went wrong reading that photo. Please try again.";

const BY_CODE: Record<string, string> = {
  trial_expired: "Your free trial has ended. Subscribe to keep using photo reading.",
  ai_consent_required:
    "Turn on AI features to read photos. Open a new quote to review and enable them.",
  rate_limited: "You've reached today's limit for photo reading. It resets at midnight UTC.",
};

const BY_STATUS: Record<number, string> = {
  400: "That photo couldn't be read. Try taking it again.",
  401: "Your session has ended. Sign in again, then retry.",
  403: "Photo reading isn't available on this account.",
  413: "That photo is too large. Crop it or take a closer photo, then retry.",
  415: "That file isn't a photo we can read. Use a JPEG or PNG.",
  429: "You've reached today's limit for photo reading. It resets at midnight UTC.",
  503: "Photo reading isn't available right now. Please try again later.",
};

export function photoPlanErrorMessage(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; message?: unknown };
  const code = typeof b.error === "string" ? b.error : "";
  const message = typeof b.message === "string" && b.message.trim() ? b.message.trim() : "";
  // Known codes: the route's own plain sentence when it sent one.
  if (code in BY_CODE) return message || BY_CODE[code];
  if (BY_STATUS[status]) return BY_STATUS[status];
  if (status >= 500) return "Photo reading failed. Please try again.";
  return FALLBACK;
}

/** A thrown fetch (offline, timeout) — never the raw exception text. */
export function photoPlanNetworkErrorMessage(err: unknown): string {
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError" || name === "FetchTimeoutError") {
    return "Reading the photo took too long. Please try again.";
  }
  return "Couldn't reach the server. Check your connection and try again.";
}
