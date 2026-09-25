"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startMicrophoneMeter } from "@/lib/microphone-level";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import {
  RESTING_BARS,
  SILENT_BARS,
  barMode,
  barScales,
  idleRipple,
  pushLevel,
  waveScales,
  withRipple,
} from "./lib/mic-levels";

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
const BAR =
  "h-full w-1.5 origin-center rounded-full bg-linear-to-t from-ui-brand to-ui-hivis transition-transform duration-ui-fast ease-ui-out motion-reduce:transition-none";

/**
 * Bars for the talk screen (see barMode in ./lib/mic-levels). Everything
 * that moves is drawn from JS straight onto each bar's transform (no
 * re-render thirty times a second, and no CSS animation a phone setting can
 * switch off):
 *
 * - Before recording, a wave says the mic is ready (not with Reduce Motion).
 * - While recording they follow the real voice, over a small ripple so a
 *   quiet room still reads as "listening". The level comes from the shared
 *   meter (a Web Audio AnalyserNode on the recording's own stream; its
 *   context primed in the mic tap, rebuilt if it only hears silence). With
 *   Reduce Motion the voice still moves them (it's feedback); the ripple
 *   stops.
 * - If the phone gives no sound level at all, the wave carries on instead,
 *   so recording never looks frozen.
 * - Hidden page: a still shape. Paused or done: flat.
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
    const paint = (scales: readonly number[]) => {
      scales.forEach((scale, i) => {
        const bar = bars.current[i];
        if (bar) bar.style.transform = scaleY(scale);
      });
    };

    if (mode === "wave") {
      // Softer before recording, full height while recording.
      const reach = listening ? 1 : 0.7;
      let frame = 0;
      const tick = (time: number) => {
        paint(waveScales(time).map((v) => v * reach));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(frame);
    }

    if (mode !== "live" || !stream) return;
    let history: number[] = [];
    return startMicrophoneMeter(stream, (level) => {
      if (level === null) {
        setFailedStream(stream);
        return;
      }
      history = pushLevel(history, level);
      const voice = barScales(history);
      paint(reducedMotion ? voice : withRipple(voice, idleRipple(performance.now())));
    });
  }, [mode, stream, listening, reducedMotion]);

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
          className={BAR}
        />
      ))}
    </div>
  );
}
