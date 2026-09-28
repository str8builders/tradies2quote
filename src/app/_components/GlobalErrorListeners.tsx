"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/clientReport";
import { isStaleDeployError } from "@/lib/stale-deploy";
import { maybeRecoverFromStaleDeploy } from "@/lib/staleDeploy";

// Kept in sync with the same pattern in
// src/lib/observability/clientErrors.ts (server-side; checks the reported
// stack's top frame instead of `event.filename`).
const EXTENSION_URL_PATTERN =
  /^(chrome|moz|safari(-web)?|ms-browser)-extension:|^webkit-masked-url:/i;
// Cross-origin scripts (most third-party embeds, and some extensions) report
// as this opaque, stack-less message — real, but never actionable from our
// side. ResizeObserver's own loop-limit notice is benign browser noise, not
// an app bug, and is well known to fire with no useful `event.error` either.
const OPAQUE_NOISE_PATTERN = /^Script error\.?$|ResizeObserver loop/;

/**
 * Whether a window `error` event is noise not worth reporting: either an
 * opaque cross-origin/browser message with no real Error to inspect, or one
 * whose source file is a browser extension (or a Safari content-blocker's
 * masked URL). Pulled out as a pure function of the event's own fields so
 * it's unit-testable without dispatching a real ErrorEvent.
 */
export function isNoiseErrorEvent(event: {
  error?: unknown;
  message?: string | null;
  filename?: string | null;
}): boolean {
  if (!event.error && OPAQUE_NOISE_PATTERN.test(event.message ?? "")) return true;
  if (event.filename && EXTENSION_URL_PATTERN.test(event.filename)) return true;
  return false;
}

/**
 * Global window error hooks — the piece clientReport.ts was written for but
 * was never mounted. React error boundaries only see RENDER errors; failures
 * in event handlers, timers and un-awaited promises (e.g. a fire-and-forget
 * fetch in the voice recorder) bypass them entirely. These two listeners are
 * the only way those reach the internal monitor.
 *
 * Renders nothing. Reporting is fire-and-forget and the endpoint is
 * per-IP rate-limited server-side; the small local dedupe just stops one
 * tight error loop from spamming the beacon.
 */
/**
 * Stale-deployment self-heal. The VPS deploy swaps the whole build, so a
 * tab left open across a deploy holds server-action IDs and RSC chunks
 * that no longer exist — its next interaction throws "Failed to find
 * Server Action" / a chunk 404 and the app looks broken until a manual
 * refresh (internal monitor, clusters on every deploy day). When we see
 * that signature, reload ONCE per session: the reload picks up the new
 * build and the user's tap works on the second try instead of never.
 */
// Shared with the /app and root error boundaries — a chunk that dies
// during render never reaches window.onerror, so the boundaries run the
// same recovery. See src/lib/staleDeploy.ts.

export function GlobalErrorListeners() {
  useEffect(() => {
    const seen = new Set<string>();
    const shouldReport = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > 20) seen.clear();
      return true;
    };

    const onError = (event: ErrorEvent) => {
      if (isNoiseErrorEvent(event)) return;
      const key = `e:${event.message}`;
      // A page from before the last deploy: it reloads itself below, and
      // there's nothing to fix, so it isn't reported.
      if (!isStaleDeployError(event.error ?? event.message) && shouldReport(key)) {
        reportClientError(event.error ?? event.message, "error");
      }
      maybeRecoverFromStaleDeploy(event.message ?? "");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const key = `r:${reason instanceof Error ? reason.message : String(reason)}`;
      if (!isStaleDeployError(reason) && shouldReport(key)) {
        reportClientError(reason, "unhandledrejection");
      }
      maybeRecoverFromStaleDeploy(
        reason instanceof Error ? reason.message : String(reason),
      );
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
