// ─────────────────────────────────────────────────────────────────────────
// Internal error monitoring — browser reporter (CLIENT-side, fire-and-forget).
//
// Sends a MINIMAL, sanitized error payload to /api/internal/client-error. Used
// by the React error boundaries and the global window handlers. Prefers
// `navigator.sendBeacon` (survives page unload, non-blocking); falls back to a
// keepalive fetch. NEVER throws — a reporter must not create new errors.
//
// Privacy: only name / message / stack / kind / pathname / a few page-rewrite
// booleans (see `pageRewriteFlags` below) are sent. No request bodies, no
// form values, no query string, no customer data. The server re-scrubs +
// truncates everything before storage (see clientErrors.ts).
// ─────────────────────────────────────────────────────────────────────────

export type ClientErrorKind = "error" | "unhandledrejection" | "boundary";

const ENDPOINT = "/api/internal/client-error";
// The route's own body cap is generous relative to this (see route.ts) —
// keeping the browser-side cap well under it means a real report is never
// the thing pushing the payload over that limit.
const MAX_STACK = 3500;

/**
 * Cheap page-rewrite signals, attached to every report so a future React
 * #418 hydration-mismatch can be classified: none of these should ever be
 * true in a stock browser, so when one is, it's a strong hint that
 * something rewrote the server HTML before hydration rather than a real app
 * bug. See the root layout's `formatDetection` fix for the most common of
 * these (iOS Safari's own phone/date/email/address detection).
 */
function pageRewriteFlags(): { translated: boolean; appleDataDetectors: boolean; grammarly: boolean } | undefined {
  try {
    if (typeof document === "undefined") return undefined;
    const html = document.documentElement;
    return {
      // Chrome's built-in translate feature marks the page once it rewrites it.
      translated: html.classList.contains("translated-ltr") || html.classList.contains("translated-rtl"),
      // iOS Safari's data detectors wrap matched text (phone/date/address/…) in these.
      appleDataDetectors: document.querySelector("[x-apple-data-detectors]") != null,
      // Grammarly's extension marks the body once it attaches.
      grammarly: document.body?.hasAttribute("data-gr-ext-installed") ?? false,
    };
  } catch {
    return undefined;
  }
}

export function reportClientError(error: unknown, kind: ClientErrorKind): void {
  try {
    if (typeof window === "undefined") return;

    // Only a real Error object carries a stack that means anything. Wrapping
    // a plain string/opaque value in `new Error(...)` here used to give it a
    // stack pointing at THIS function — looking exactly like the bug lived
    // in our own reporting code, when the real error was e.g. a cross-origin
    // "Script error." with no accessible detail at all.
    const isRealError = error instanceof Error;
    const name = isRealError ? error.name : "Error";
    const message = isRealError
      ? error.message
      : typeof error === "string"
        ? error
        : "Client error";
    const stack =
      isRealError && typeof error.stack === "string" ? error.stack.slice(0, MAX_STACK) : undefined;

    const payload = {
      name,
      message,
      stack,
      kind,
      // pathname ONLY — never search/hash (avoids leaking query params).
      path: typeof window.location?.pathname === "string" ? window.location.pathname : undefined,
      flags: pageRewriteFlags(),
    };

    const body = JSON.stringify(payload);

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(ENDPOINT, blob);
      return;
    }

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* a reporter must never throw */
  }
}
