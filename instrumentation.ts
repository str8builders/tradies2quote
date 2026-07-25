/**
 * Next.js 16 instrumentation hook — wires up Sentry on the server +
 * edge runtimes by lazily importing the right config file based on
 * which runtime is currently booting.
 *
 * Sentry stays inert (no init, no overhead, not even in the bundle on
 * cold paths) unless `NEXT_PUBLIC_SENTRY_DSN` is set in the
 * environment. That means the app runs identically with or without a
 * Sentry account — flip on error tracking post-launch by adding the
 * env var in Vercel, no code redeploy needed for activation.
 *
 * The client runtime is wired separately via `sentry.client.config.ts`,
 * which Next.js auto-loads when present.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Captures errors thrown inside React Server Components and route
 * handlers.
 *
 * Two sinks, independently gated:
 *   1. The INTERNAL error monitor (own Supabase, owner dashboard) —
 *      always on. Without this, self-hosted deploys with no Sentry DSN
 *      had zero visibility into unhandled server errors: `captureError`
 *      only covers errors caught inside route handlers, while errors
 *      that BUBBLE OUT of a handler only ever reach this hook.
 *   2. Sentry — only when `NEXT_PUBLIC_SENTRY_DSN` is set, lazily
 *      imported so it stays out of the bundle on cold paths.
 */
export async function onRequestError(
  err: unknown,
  request: Parameters<typeof _captureNoop>[1],
  context: Parameters<typeof _captureNoop>[2],
): Promise<void> {
  try {
    // Node runtime only — the internal sink hashes fingerprints with
    // node:crypto, which the Edge runtime (proxy only) can't load.
    if (process.env.NEXT_RUNTIME !== "nodejs") throw new Error("edge");
    const { captureError } = await import("@/lib/observability");
    captureError(err, {
      route: request.path,
      surface:
        context.routerKind === "App Router" &&
        context.routeType === "action"
          ? "server_action"
          : "api",
      extra: {
        unhandled: true,
        routeType: context.routeType,
        method: request.method,
      },
    });
  } catch {
    /* reporting must never affect the request */
  }

  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(err, request, context);
}

// Pulled out so the signature of `onRequestError` is inferred from
// Sentry's own type without us importing Sentry at module scope (which
// would defeat the no-bundle guarantee when DSN is absent).
declare const _captureNoop: typeof import("@sentry/nextjs").captureRequestError;
