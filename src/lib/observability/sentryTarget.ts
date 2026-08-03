/**
 * Where is Sentry actually sending events?
 *
 * The SDK configs were written for one destination: a hosted Sentry project.
 * That's why they're production-only — dev errors shouldn't burn quota or
 * pollute the real project's issue stream.
 *
 * A DSN pointing at this machine (STR8SENTRY, or any self-hosted sink on
 * localhost) inverts that reasoning entirely: capturing dev errors is the
 * whole point, there is no quota, and nothing leaves the machine. These
 * helpers keep that distinction in one place so the three Sentry configs
 * (client / server / edge) can't drift apart.
 */

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * True when the DSN targets a sink running on this machine, so events never
 * cross the network and no third party ever sees them.
 */
export function isLocalSentrySink(dsn: string | undefined): boolean {
  if (!dsn) return false;
  try {
    return LOCAL_HOSTNAMES.has(new URL(dsn).hostname);
  } catch {
    // A malformed DSN is never treated as local — fail closed.
    return false;
  }
}

/**
 * Whether `Sentry.init` should actually send anything.
 *
 * Production keeps its existing behaviour. Outside production we only enable
 * for a local sink, so `npm run dev` against a hosted DSN stays silent exactly
 * as before.
 */
export function isSentryEnabled(dsn: string | undefined): boolean {
  if (!dsn) return false;
  return process.env.NODE_ENV === "production" || isLocalSentrySink(dsn);
}

/**
 * Sample every trace against a local sink (no quota, and partial sampling
 * makes local tracing useless); keep the conservative 10% for a hosted one.
 */
export function sentryTracesSampleRate(dsn: string | undefined): number {
  return isLocalSentrySink(dsn) ? 1.0 : 0.1;
}

/**
 * Server/edge PII stays off for hosted Sentry — the App Store privacy posture
 * keeps customer data out of third-party error logs. A local sink is not a
 * third party and the data never leaves the machine, so request context is
 * safe there and makes errors far easier to debug.
 */
export function sentrySendDefaultPii(dsn: string | undefined): boolean {
  return isLocalSentrySink(dsn);
}
