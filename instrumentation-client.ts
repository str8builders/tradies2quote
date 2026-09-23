/**
 * Sentry — browser-side init (Next 16 native client instrumentation).
 *
 * Next.js 16 auto-loads `instrumentation-client.ts` on the client, which is
 * how the browser Sentry SDK activates (this replaces the legacy
 * `sentry.client.config.ts`, which was NOT auto-loaded under Turbopack).
 *
 * The SDK is loaded lazily and ONLY when `NEXT_PUBLIC_SENTRY_DSN` is set (see
 * src/lib/observability/sentryBrowser.ts). Without a DSN nothing from Sentry
 * reaches the browser; the internal error sink below still runs everywhere.
 *
 * Session Replay is sampled at 0% normally and 100% on error, with all text
 * + media masked so a tradie's transcript / client PII is never captured.
 */
import { reportClientError } from "@/lib/observability/clientReport";
import {
  isLocalSentrySink,
  isSentryEnabled,
  sentryTracesSampleRate,
} from "@/lib/observability/sentryTarget";
import { loadSentry, sentryDsn as DSN } from "@/lib/observability/sentryBrowser";

type SentryModule = typeof import("@sentry/nextjs");
let sentry: SentryModule | null = null;

if (DSN) {
  void loadSentry().then((Sentry) => {
    if (!Sentry) return;
    sentry = Sentry;
    Sentry.init({
      dsn: DSN,
      // Production as before; also on in dev when the DSN is a local sink
      // (STR8SENTRY), where capturing dev errors is the entire point.
      enabled: isSentryEnabled(DSN),
      tracesSampleRate: sentryTracesSampleRate(DSN),
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],
      sendDefaultPii: true,
      environment:
        process.env.NEXT_PUBLIC_VERCEL_ENV ??
        process.env.NODE_ENV ??
        "development",
    });
    identifyLocalVisitor(Sentry);
  });
}

// Sessions carry no identity unless a user is set, so the local monitor could
// count visits but not people. A random per-browser id fixes that. Local sink
// only — this must never attach an identifier to events leaving the machine.
function identifyLocalVisitor(Sentry: SentryModule) {
  if (!isLocalSentrySink(DSN)) return;
  try {
    const KEY = "s8.visitor";
    let visitor = window.localStorage.getItem(KEY);
    if (!visitor) {
      visitor = crypto.randomUUID().replace(/-/g, "");
      window.localStorage.setItem(KEY, visitor);
    }
    Sentry.setUser({ id: visitor });
  } catch {
    // Private mode / blocked storage: counting degrades, nothing breaks.
  }
}

// Next 16 client navigation instrumentation — lets Sentry tie errors to the
// route transition the user was on. Required hook export for the App Router.
// A no-op until (and unless) the SDK has loaded.
export function onRouterTransitionStart(
  ...args: Parameters<SentryModule["captureRouterTransitionStart"]>
) {
  sentry?.captureRouterTransitionStart(...args);
}

// Internal monitor — global handlers for errors React boundaries don't catch
// (async callbacks, event handlers, unhandled promise rejections). Conservative
// on purpose: we only report when a real Error object is present, which skips
// the opaque cross-origin "Script error." noise from extensions / 3rd-party
// scripts. Fire-and-forget; never blocks or throws.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (event?.error instanceof Error) {
      reportClientError(event.error, "error");
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent)?.reason;
    if (reason instanceof Error) {
      reportClientError(reason, "unhandledrejection");
    }
  });
}
