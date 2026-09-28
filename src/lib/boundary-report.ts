import { isStaleDeployError } from "./stale-deploy";

/**
 * Whether an error boundary (src/app/error.tsx, src/app/app/error.tsx,
 * src/app/global-error.tsx) should send the error it caught to the internal
 * error sink and Sentry. It still logs it to the console either way.
 *
 *   - A stale deploy ("Server Action … was not found", a missing chunk): a
 *     page left open across an update. The boundary reloads it; it isn't a
 *     bug, and reporting each one filled the error log on deploy days.
 *   - An error with a `digest`: a server error. The server already recorded
 *     it (instrumentation.ts onRequestError → captureError, and Sentry's
 *     server SDK when configured); the browser's copy only has the digest,
 *     so re-reporting it just duplicates the entry.
 *
 * Everything else is a real client-side error and is reported.
 */
export function shouldReportBoundaryError(error: unknown): boolean {
  if (isStaleDeployError(error)) return false;
  const digest = error && typeof error === "object" ? (error as { digest?: unknown }).digest : undefined;
  return !(typeof digest === "string" && digest.length > 0);
}
