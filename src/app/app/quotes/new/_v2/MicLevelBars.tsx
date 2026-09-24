"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { startMicrophoneMeter } from "@/lib/microphone-level";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { RESTING_BARS, SILENT_BARS, barMode, barScales, pushLevel } from "./lib/mic-levels";

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

/**
 * Bars that move with the real microphone while recording. The level comes
 * from the shared meter (a Web Audio AnalyserNode on the recording's own
 * stream, RMS of each ~32 ms frame) and is written straight onto each bar's
 * transform, so the screen doesn't re-render thirty times a second. The
 * meter runs only while listening, on a visible page, without reduced
 * motion: it stops on pause, stop, unmount or when the page is hidden. With
 * reduced motion (or a meter that can't start) the bars hold a still shape;
 * when not listening they lie flat.
 */
export function MicLevelBars({ stream, listening }: { stream: MediaStream | null; listening: boolean }) {
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const mode = barMode({ listening, reducedMotion, pageVisible, hasStream: stream !== null });
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
        paint(RESTING_BARS);
        return;
      }
      history = pushLevel(history, level);
      paint(barScales(history));
    });
  }, [mode, stream]);

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
          className="h-full w-1.5 origin-center rounded-full bg-ui-brand-text transition-transform duration-ui-fast ease-ui-out motion-reduce:transition-none"
        />
      ))}
    </div>
  );
}
