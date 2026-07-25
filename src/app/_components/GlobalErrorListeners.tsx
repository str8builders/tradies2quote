"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/clientReport";
import { maybeRecoverFromStaleDeploy } from "@/lib/staleDeploy";

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
      const key = `e:${event.message}`;
      if (shouldReport(key)) {
        reportClientError(event.error ?? event.message, "error");
      }
      maybeRecoverFromStaleDeploy(event.message ?? "");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const key = `r:${reason instanceof Error ? reason.message : String(reason)}`;
      if (shouldReport(key)) {
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
