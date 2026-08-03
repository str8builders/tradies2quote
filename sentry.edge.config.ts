/**
 * Sentry — Vercel Edge runtime config (proxy.ts + any edge route
 * handlers + middleware-style hooks).
 *
 * Loaded lazily by `instrumentation.ts → register()` only when
 * `NEXT_PUBLIC_SENTRY_DSN` is present. See sentry.server.config.ts
 * for the rationale on each tuning knob.
 */
import * as Sentry from "@sentry/nextjs";
import {
  isSentryEnabled,
  sentrySendDefaultPii,
  sentryTracesSampleRate,
} from "@/lib/observability/sentryTarget";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: DSN,
  enabled: isSentryEnabled(DSN),
  tracesSampleRate: sentryTracesSampleRate(DSN),
  // Server-side (edge/proxy) — keep customer PII out of 3rd-party error logs.
  // A local sink never leaves the machine, so it gets full request context.
  sendDefaultPii: sentrySendDefaultPii(DSN),
  environment:
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development",
});
