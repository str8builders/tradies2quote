"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startMicrophoneMeter } from "@/lib/microphone-level";
import { cx } from "@/components/ui/cx";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { BAR_COUNT, RESTING_BARS, SILENT_BARS, barMode, barScales, pushLevel, waveTiming } from "./lib/mic-levels";

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

const scaleY = (scale: number) => `scaleY(${scale})`;
const BAR = "w-1.5 origin-center rounded-full bg-linear-to-t from-ui-brand to-ui-hivis";
const WAVE_BARS = Array.from({ length: BAR_COUNT }, (_, i) => waveTiming(i));

/**
 * Bars for the talk screen (see barMode in ./lib/mic-levels):
 *
 * - Before recording, a gentle wave says the mic is ready.
 * - While recording they follow the real voice. The level comes from the
 *   shared meter (a Web Audio AnalyserNode on the recording's own stream,
 *   RMS of each ~32 ms frame, its audio context primed in the mic tap for
 *   iPhones) and is written straight onto each bar's transform, so the
 *   screen doesn't re-render thirty times a second.
 * - If the phone gives no sound level (the meter can't start, or never
 *   does), the wave carries on instead, so it never looks frozen.
 * - Reduced motion or a hidden page: a still shape. Paused or done: flat.
 */
export function MicLevelBars({
  stream,
  listening,
  inviting = false,
}: {
  stream: MediaStream | null;
  listening: boolean;
  /** Not recording yet (idle, or getting the mic ready). */
  inviting?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  // The stream whose meter gave no level; a new recording starts afresh.
  const [failedStream, setFailedStream] = useState<MediaStream | null>(null);
  const mode = barMode({
    listening,
    inviting,
    meterFailed: stream !== null && failedStream === stream,
    reducedMotion,
    pageVisible,
    hasStream: stream !== null,
  });
  const bars = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    if (mode !== "live" || !stream) return;
    let history: number[] = [];
    const paint = (scales: readonly number[]) => {
      scales.forEach((scale, i) => {
        const bar = bars.current[i];
        if (bar) bar.style.transform = scaleY(scale);
      });
    };
    return startMicrophoneMeter(stream, (level) => {
      if (level === null) {
        setFailedStream(stream);
        return;
      }
      history = pushLevel(history, level);
      paint(barScales(history));
    });
  }, [mode, stream]);

  if (mode === "wave") {
    return (
      <div
        key={mode}
        aria-hidden="true"
        data-bars={mode}
        className="flex h-16 w-full max-w-xs items-center justify-center gap-1"
      >
        {WAVE_BARS.map((timing, i) => (
          <span
            key={i}
            style={{ animationDuration: `${timing.duration}s`, animationDelay: `${timing.delay}s` }}
            className={cx(BAR, listening ? "h-full" : "h-2/3", "animate-ui-level motion-reduce:animate-none")}
          />
        ))}
      </div>
    );
  }

  const scales = mode === "resting" ? RESTING_BARS : SILENT_BARS;
  return (
    <div
      key={mode}
      aria-hidden="true"
      data-bars={mode}
      className="flex h-16 w-full max-w-xs items-center justify-center gap-1"
    >
      {scales.map((scale, i) => (
        <span
          key={i}
          ref={(bar) => {
            bars.current[i] = bar;
          }}
          style={{ transform: scaleY(scale) }}
          className={cx(BAR, "h-full transition-transform duration-ui-fast ease-ui-out motion-reduce:transition-none")}
        />
      ))}
    </div>
  );
}
