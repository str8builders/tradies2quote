/**
 * Sentry — Node.js runtime config.
 *
 * Loaded lazily by `instrumentation.ts → register()` only when
 * `NEXT_PUBLIC_SENTRY_DSN` is present, so this file never executes
 * (and `@sentry/nextjs` never enters the bundle) for builds without
 * Sentry configured.
 *
 * Conservative defaults:
 *   - `tracesSampleRate: 0.1` — keep performance-sampling cost low
 *   - `replaysOnErrorSampleRate: 1.0` — capture replays only on
 *     errors, not on every session
 *   - `enabled: production-only` — local dev errors don't flood the
 *     project
 *
 * Each of those knobs relaxes when the DSN points at a sink on this machine
 * (STR8SENTRY): there's no quota to protect and nothing leaves the box. See
 * `src/lib/observability/sentryTarget.ts`. A hosted DSN behaves exactly as
 * it always has.
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
  // Don't send PII (IPs, request bodies with client emails) to hosted Sentry —
  // the App Store / privacy posture means we keep customer data out of
  // 3rd-party error logs. Server errors still carry stack + tags, just not
  // user data. A local sink is not a third party, so it gets full context.
  sendDefaultPii: sentrySendDefaultPii(DSN),
  // Tag the environment so production / preview events stay separable
  // in the Sentry UI.
  environment:
    process.env.VERCEL_ENV ??
    process.env.NODE_ENV ??
    "development",
});
