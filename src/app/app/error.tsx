"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observability/clientReport";
import { maybeRecoverFromStaleDeploy } from "@/lib/staleDeploy";
import { ArrowClockwise, House, WarningOctagon } from "@phosphor-icons/react";

/**
 * Global error boundary for every `/app/*` page.
 *
 * Wave 11 — Next 16's app-router error.tsx convention. If any /app page
 * throws during render, Next mounts this component instead of the blank
 * white screen. It logs the error to the console for owner debugging
 * and gives the user three calm exits: retry, dashboard, or just back.
 *
 * No PII in the message. We never show the raw stack to end users —
 * only Next's error digest if present, so owner support can correlate
 * it with the build logs.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry (no-op without a DSN), then log the full error for the
    // owner's browser console (and Vercel function logs for SSR errors). End
    // users only ever see the digest.
    Sentry.captureException(error);
    reportClientError(error, "boundary");
    console.error("[/app/* error]", error);
    // Stale-deploy chunk death during render lands HERE, not on
    // window.onerror — reload once so the user's next tap works instead
    // of trapping them on this screen ("Try again" re-imports the same
    // dead chunk forever).
    maybeRecoverFromStaleDeploy(`${error.name ?? ""} ${error.message ?? ""}`);
  }, [error]);

  return (
    <div className="min-h-screen text-white">
      <main className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <div className="t2q-card-pro p-6 sm:p-10">
          <span
            aria-hidden="true"
            className="inline-flex h-12 w-12 items-center justify-center rounded-sm border border-red-500/40 bg-red-500/10 text-red-300"
          >
            <WarningOctagon size={22} weight="fill" />
          </span>
          <h1 className="mt-5 font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Something tripped a circuit.
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Tradies2Quote hit an unexpected error on this page. Your work
            isn&apos;t lost — quotes save before this point. Try again, or
            head back to the dashboard.
          </p>

          {error?.digest ? (
            <p className="mt-4 inline-flex items-center gap-2 rounded-sm border border-ink-700 bg-ink-900 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
              <span aria-hidden="true">{"//"}</span>
              <span>error id {error.digest}</span>
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() => reset()}
              data-testid="app-error-retry"
              className="t2q-btn-primary-pro inline-flex h-11 items-center justify-center gap-2 px-5"
            >
              <ArrowClockwise size={16} weight="bold" />
              Try again
            </button>
            <Link
              href="/app"
              data-testid="app-error-dashboard"
              className="t2q-btn-ghost-pro inline-flex h-11 items-center justify-center gap-2 px-5"
            >
              <House size={16} weight="bold" />
              Back to dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
