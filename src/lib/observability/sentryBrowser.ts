/**
 * Browser Sentry, loaded only when a DSN is configured.
 *
 * `NEXT_PUBLIC_SENTRY_DSN` is inlined at build time. Production currently has
 * no DSN, yet a static `import * as Sentry` shipped the whole SDK plus the
 * session-replay recorder to every visitor on every page (roughly a third of
 * the home page's JavaScript). Everything here is a no-op without a DSN, and
 * with one the SDK arrives as a separate chunk after first paint.
 *
 * The internal error sink (reportClientError) is unaffected and still records
 * every client error, including any in the moment before Sentry finishes
 * loading.
 */
type SentryModule = typeof import("@sentry/nextjs");

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

let loading: Promise<SentryModule | null> | null = null;

/** Resolve the SDK when a DSN exists, otherwise null. Never throws. */
export function loadSentry(): Promise<SentryModule | null> {
  if (!DSN) return Promise.resolve(null);
  loading ??= import("@sentry/nextjs").then(
    (mod) => mod,
    () => null,
  );
  return loading;
}

/** Report a caught error to Sentry when configured; a no-op otherwise. */
export function captureToSentry(error: unknown): void {
  if (!DSN) return;
  void loadSentry().then((Sentry) => {
    Sentry?.captureException(error);
  });
}

export const sentryDsn = DSN;
