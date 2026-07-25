"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { reportClientError } from "@/lib/observability/clientReport";
import { maybeRecoverFromStaleDeploy } from "@/lib/staleDeploy";
import {
  ArrowClockwise,
  ArrowLeft,
  WarningOctagon,
} from "@phosphor-icons/react";

/**
 * Root error boundary — catches render errors on every route that
 * doesn't have its own `error.tsx`: the marketing landing, the
 * `(auth)` and `(legal)` pages, and the public `/quote/[token]` client
 * view. The `/app/*` section keeps its own boundary at
 * `src/app/app/error.tsx`.
 *
 * Mirrors that /app boundary's calm, no-stack-trace style: log the full
 * error to the console (and Vercel function logs for SSR errors) for
 * owner debugging, show the user only Next's error digest, and give two
 * clear exits — retry, or back to home.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to Sentry (no-op without a DSN) so client render crashes caught
    // by this boundary aren't only in the console.
    Sentry.captureException(error);
    reportClientError(error, "boundary");
    console.error("[root error]", error);
    // Render-path chunk death after a deploy lands here, not on
    // window.onerror — reload once instead of stranding the user.
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
            Tradies2Quote hit an unexpected error loading this page. It&apos;s
            not you — try again, or head back to the home page.
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
              data-testid="root-error-retry"
              className="t2q-btn-primary-pro inline-flex h-11 items-center justify-center gap-2 px-5"
            >
              <ArrowClockwise size={16} weight="bold" />
              Try again
            </button>
            <Link
              href="/"
              data-testid="root-error-home"
              className="t2q-btn-ghost-pro inline-flex h-11 items-center justify-center gap-2 px-5"
            >
              <ArrowLeft size={16} weight="bold" />
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
