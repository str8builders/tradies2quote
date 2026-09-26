"use client";

import { ArrowClockwise, CheckCircle, House, SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  fmtElapsed,
  useQuoteGeneration,
  type QuoteGeneration,
} from "../../_components/QuoteGenerator";

export type GeneratingPanelViewProps = Omit<QuoteGeneration, "retry"> & {
  onRetry: () => void;
};

/** The line under the heading while the quote is written (the classic card's words). */
export function generatingMessage({
  complete,
  waitingNote,
  elapsedS,
}: Pick<QuoteGeneration, "complete" | "waitingNote" | "elapsedS">): string {
  if (complete) return "Opening your review.";
  if (waitingNote) return waitingNote;
  return elapsedS >= 60
    ? "Still working. Your job details are saved."
    : "Turning your job details into materials, labour and a total for you to check.";
}

/**
 * "Writing your quote" in the new look, drawn with the kit: the spinner and
 * clock while it's written, a tick when it's back, and a plain callout with
 * Try again if it fails. The test ids match the classic card's.
 */
export function GeneratingPanelView({
  pending,
  complete,
  error,
  waitingNote,
  elapsedS,
  onRetry,
}: GeneratingPanelViewProps) {
  if (!pending) {
    return (
      <div data-testid="quote-generator" data-state="failed" role="alert">
        <Callout
          tone="bad"
          title={<span data-testid="quote-generator-error">We couldn&apos;t write your quote</span>}
          action={
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                size="md"
                icon={<ArrowClockwise weight="bold" />}
                onClick={onRetry}
                data-testid="quote-generator-retry"
              >
                Try again
              </Button>
              <ButtonLink
                href="/app"
                variant="ghost"
                icon={<House weight="bold" />}
                data-testid="quote-generator-dashboard"
              >
                Back to Home
              </ButtonLink>
            </div>
          }
        >
          {error ? <p>{error}</p> : null}
          <p className={error ? "mt-1" : undefined}>
            Your job details are saved. Try again, or come back to it later from Jobs.
          </p>
        </Callout>
      </div>
    );
  }

  return (
    <Card
      padding="lg"
      data-testid="quote-generator"
      data-state={complete ? "ready" : "writing"}
      className="flex min-h-80 flex-col items-center justify-center text-center"
    >
      {complete ? (
        <CheckCircle aria-hidden="true" weight="fill" className="text-[2.75rem] text-ui-ok" />
      ) : (
        <SpinnerGap
          aria-hidden="true"
          weight="bold"
          className="animate-spin text-[2.75rem] text-ui-brand-text motion-reduce:animate-none"
        />
      )}
      <h2 className="ui-title mt-4 text-ui-xl text-ui-text">
        {complete ? "Your quote is ready" : "Writing your quote…"}
      </h2>
      <p aria-live="polite" className="mt-2 max-w-sm text-ui-base text-ui-muted">
        {generatingMessage({ complete, waitingNote, elapsedS })}
      </p>
      <p className="mt-3 text-ui-sm tabular-nums text-ui-muted">{`${fmtElapsed(elapsedS)} elapsed`}</p>
    </Card>
  );
}

/** Writes the quote (the classic generator's logic) and shows it the new way. */
export function GeneratingPanel({ quoteId }: { quoteId: string }) {
  const { retry, ...generation } = useQuoteGeneration(quoteId);
  return <GeneratingPanelView {...generation} onRetry={retry} />;
}
