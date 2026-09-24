"use client";

import { useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";

type Props = {
  videoUrl: string;
  posterUrl: string;
  businessName: string | null;
};

/**
 * The tradie's 15-second quote video at the top of the client's quote link.
 * Shows the poster frame with a big play button; nothing downloads until the
 * client taps it (preload="none"), it never autoplays, and it plays inline on
 * iPhones. The page only renders this for a video of the quote's current
 * version.
 */
export function QuoteVideoPlayer({ videoUrl, posterUrl, businessName }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);
  const who = businessName?.trim() || "Your tradie";

  function play() {
    setStarted(true);
    // Native controls take over from here if the browser wants a second tap.
    void ref.current?.play().catch(() => undefined);
  }

  return (
    <section data-testid="public-quote-video" aria-labelledby="public-quote-video-title" className="t2q-card-pro p-4 sm:p-5">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">{"// your quote in 15 seconds"}</p>
      <h2 id="public-quote-video-title" className="mt-1 text-sm text-ink-200">
        {who} made a short video of this quote.
      </h2>
      <div className="relative mx-auto mt-3 aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
        <video
          ref={ref}
          data-testid="public-quote-video-player"
          className="h-full w-full object-cover"
          src={videoUrl}
          poster={posterUrl}
          playsInline
          preload="none"
          controls={started}
          aria-label={`Video of your quote from ${who}`}
          onPlay={() => setStarted(true)}
          onError={() => setFailed(true)}
        />
        {!started ? (
          <button
            type="button"
            data-testid="public-quote-video-play"
            onClick={play}
            aria-label="Play the quote video"
            className="absolute inset-0 flex items-center justify-center bg-black/10"
          >
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-ink-900 shadow-[0_12px_40px_-10px_rgba(255,95,21,0.8)]">
              <Play size={36} weight="fill" />
            </span>
          </button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-ink-300">
          The video didn&apos;t load. Refresh the page to watch it.
        </p>
      ) : null}
    </section>
  );
}
