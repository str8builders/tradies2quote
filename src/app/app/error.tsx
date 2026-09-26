"use client";

import { useEffect } from "react";
import { ArrowClockwise, House } from "@phosphor-icons/react/dist/ssr";
import { captureToSentry } from "@/lib/observability/sentryBrowser";
import { reportClientError } from "@/lib/observability/clientReport";
import { maybeRecoverFromStaleDeploy } from "@/lib/staleDeploy";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Screen } from "@/components/ui/screen";

/**
 * Global error boundary for every `/app/*` page.
 *
 * Wave 11 — Next 16's app-router error.tsx convention. If any /app page
 * throws during render, Next mounts this component instead of the blank
 * white screen. It logs the error to the console for owner debugging
 * and gives the user two calm exits: try again, or Home.
 *
 * No PII in the message. We never show the raw stack to end users —
 * only Next's error digest if present, so owner support can correlate
 * it with the build logs.
 *
 * An error boundary can't ask which look is on, so this is drawn once in
 * ui- tokens and kit parts (as settings' LoadFailed is): it paints its own
 * ui background, so it reads right in both shells, dark or outdoor.
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
    captureToSentry(error);
    reportClientError(error, "boundary");
    console.error("[/app/* error]", error);
    // Stale-deploy chunk death during render lands HERE, not on
    // window.onerror — reload once so the user's next tap works instead
    // of trapping them on this screen ("Try again" re-imports the same
    // dead chunk forever).
    maybeRecoverFromStaleDeploy(`${error.name ?? ""} ${error.message ?? ""}`);
  }, [error]);

  return (
    <Screen data-testid="app-error">
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 pt-10 pb-10">
        <h1 className="ui-heading text-ui-2xl text-ui-text">Something went wrong</h1>
        <Callout
          tone="bad"
          title="This page hit an unexpected error"
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                variant="secondary"
                icon={<ArrowClockwise weight="bold" />}
                onClick={() => reset()}
                data-testid="app-error-retry"
              >
                Try again
              </Button>
              <ButtonLink href="/app" variant="ghost" icon={<House weight="bold" />} data-testid="app-error-dashboard">
                Back to Home
              </ButtonLink>
            </div>
          }
        >
          <p>Your work isn&apos;t lost: quotes save before this point. Try again, or head back to Home.</p>
          {error?.digest ? (
            <p className="mt-2 text-ui-muted">
              Error code: <span className="tabular-nums">{error.digest}</span>
            </p>
          ) : null}
        </Callout>
      </main>
    </Screen>
  );
}
