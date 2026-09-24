"use client";

import {
  ArrowClockwise,
  DownloadSimple,
  ShareNetwork,
  SpinnerGap,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr";
import { Button, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import type { QuoteVideoCardViewProps } from "../../_components/QuoteVideoCard";

/**
 * The quote video card in the new look. Same states, same buttons, same
 * test ids as the classic view; the container (QuoteVideoCard) and its
 * behaviour are unchanged — only the drawing differs. Its buttons are
 * secondary: on the job page the one orange button is the next step.
 */
export function QuoteVideoCardV2View(props: QuoteVideoCardViewProps) {
  const { status, requesting, slow, error, canShareFiles, shareState, fileHref } = props;
  const make = (label: string) => (
    <Button
      data-testid="quote-video-make"
      variant="secondary"
      fullWidth
      icon={<VideoCamera weight="bold" />}
      loading={requesting}
      loadingLabel="Starting…"
      onClick={props.onRequest}
    >
      {label}
    </Button>
  );
  return (
    <section
      id="quote-video"
      data-testid="quote-video-card"
      data-state={status.kind}
      aria-labelledby="quote-video-heading"
      className="space-y-3"
    >
      <SectionTitle id="quote-video-heading">Quote video</SectionTitle>
      <Card>
        {status.kind === "none" ? (
          <div className="space-y-4">
            <p className="text-ui-muted">Turn this quote into a 15-second video your client can watch on their phone.</p>
            {make("Make a quote video")}
          </div>
        ) : null}

        {status.kind === "working" && !slow ? (
          <div data-testid="quote-video-working" role="status" className="flex items-start gap-3">
            <SpinnerGap
              aria-hidden="true"
              weight="bold"
              className="mt-0.5 shrink-0 animate-spin text-[1.75rem] text-ui-brand-text motion-reduce:animate-none"
            />
            <div>
              <p className="font-semibold">Making your video… usually under a minute.</p>
              <p className="text-ui-sm text-ui-muted">You can leave this page. It keeps going.</p>
            </div>
          </div>
        ) : null}

        {status.kind === "working" && slow ? (
          <div className="space-y-4">
            <p data-testid="quote-video-slow" role="status">
              This is taking longer than usual. It will keep going, so check back in a few minutes.
            </p>
            <Button
              data-testid="quote-video-check-again"
              variant="secondary"
              fullWidth
              icon={<ArrowClockwise weight="bold" />}
              onClick={props.onCheckAgain}
            >
              Check again
            </Button>
          </div>
        ) : null}

        {status.kind === "ready" ? (
          <div className="space-y-4">
            <video
              data-testid="quote-video-preview"
              className="aspect-[9/16] w-full max-w-72 rounded-ui-lg border border-ui-line bg-ui-bg object-cover"
              src={status.videoUrl}
              poster={status.posterUrl}
              controls
              playsInline
              preload="none"
              aria-label="Quote video preview"
              onError={props.onPreviewError}
            />
            {canShareFiles ? (
              <Button
                data-testid="quote-video-share"
                variant="secondary"
                fullWidth
                icon={<ShareNetwork weight="bold" />}
                loading={shareState === "preparing"}
                loadingLabel="Getting the video ready…"
                onClick={props.onShare}
              >
                Share video
              </Button>
            ) : (
              <a
                data-testid="quote-video-download"
                href={fileHref}
                download={status.fileName}
                className={buttonClasses({ variant: "secondary", fullWidth: true })}
              >
                <DownloadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
                Download video
              </a>
            )}
            {shareState === "again" ? (
              <p data-testid="quote-video-share-again" role="status" className="text-ui-sm">
                The video is ready. Tap Share video again.
              </p>
            ) : null}
            {shareState === "error" ? (
              <p data-testid="quote-video-share-error" role="alert" className="text-ui-sm text-ui-bad">
                The video couldn&apos;t be shared.{" "}
                <a
                  href={fileHref}
                  download={status.fileName}
                  className="ui-focus-ring inline-flex min-h-12 items-center font-semibold text-ui-brand-text underline"
                >
                  Download it instead
                </a>
              </p>
            ) : null}
            <p className="text-ui-sm text-ui-muted">It also plays at the top of your client&apos;s quote link.</p>
          </div>
        ) : null}

        {status.kind === "stale" ? (
          <div className="space-y-4">
            <p data-testid="quote-video-stale">
              {status.hadVideo
                ? "You've changed this quote since the video was made, so it no longer matches. Your client won't see the old one."
                : "You've changed this quote since you asked for a video."}
            </p>
            {make("Make a new video")}
          </div>
        ) : null}

        {status.kind === "failed" ? (
          <div className="space-y-4">
            <p data-testid="quote-video-failed">Sorry, we couldn&apos;t make the video this time.</p>
            {make("Try again")}
          </div>
        ) : null}

        {error ? (
          <div data-testid="quote-video-error" role="alert" className="mt-4">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </Card>
    </section>
  );
}
