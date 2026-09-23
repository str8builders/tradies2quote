"use client";

import { useEffect } from "react";
import { captureToSentry } from "@/lib/observability/sentryBrowser";
import { reportClientError } from "@/lib/observability/clientReport";

/**
 * Global error boundary — the absolute last-resort fallback. Next.js
 * mounts this ONLY when the root layout itself throws, so it replaces
 * `layout.tsx` entirely and must render its own <html> / <body>.
 *
 * Because the root layout — fonts, globals.css, theme boot — is exactly
 * what failed, this file deliberately uses zero app dependencies: no
 * Tailwind classes, no design-system components, no custom fonts, only
 * inline styles. It just has to render something calm and on-brand and
 * let the user retry. In practice it should almost never be seen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Next's Sentry SDK does NOT auto-instrument global-error — the
    // root-layout-crash case, the worst class of error, must be reported
    // explicitly or it's silently swallowed. No-ops without a DSN.
    captureToSentry(error);
    reportClientError(error, "boundary");
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#111111",
          color: "#ffffff",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          padding: "24px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ maxWidth: "440px", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "11px",
              letterSpacing: "0.3em",
              textTransform: "uppercase",
              color: "#FF5F15",
            }}
          >
            {"// error"}
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontSize: "28px",
              lineHeight: 1.15,
              textTransform: "uppercase",
              fontWeight: 800,
            }}
          >
            Tradies2Quote hit a snag.
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: "15px",
              lineHeight: 1.5,
              color: "#a3a3a3",
            }}
          >
            Something went wrong loading the app. Try again — if it keeps
            happening, give it a minute and reload.
          </p>
          {error?.digest ? (
            <p
              style={{
                margin: "16px 0 0",
                fontSize: "11px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "#737373",
              }}
            >
              error id {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "24px",
              backgroundColor: "#FF5F15",
              color: "#111111",
              border: "none",
              borderRadius: "4px",
              padding: "12px 24px",
              fontSize: "14px",
              fontWeight: 700,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
