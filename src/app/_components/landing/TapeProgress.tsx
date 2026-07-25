"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reusable tape-measure progress bar. Two modes:
 *   - indeterminate (default): an orange needle sweeps 0 → 100mm in a loop
 *   - determinate: pass `progress` 0..1 to control the fill explicitly
 *
 * Used by `LoadingScreen` for the splash and could also drive an
 * "AI is thinking" inline state inside the dashboard if we ever want to
 * carry the tradie aesthetic deeper into the app.
 *
 * Ported from `landing-export/components/TapeProgress.jsx`.
 */
type Props = {
  progress?: number;
  duration?: number;
  width?: number;
  height?: number;
  showReadout?: boolean;
  label?: string;
  className?: string;
  testId?: string;
};

export default function TapeProgress({
  progress,
  duration = 2400,
  width = 340,
  height = 36,
  showReadout = true,
  label = "// scanning",
  className = "",
  testId,
}: Props) {
  const isControlled = typeof progress === "number";
  const [internal, setInternal] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (isControlled) return;
    const tick = (t: number) => {
      if (!startRef.current) startRef.current = t;
      const elapsed = (t - startRef.current) % duration;
      setInternal(elapsed / duration);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isControlled, duration]);

  const p = Math.max(0, Math.min(1, isControlled ? (progress ?? 0) : internal));
  const ticks = Array.from({ length: 101 }, (_, i) => i);

  return (
    <div className={className} data-testid={testId}>
      <div
        className="relative rounded-sm overflow-hidden border-2 border-ink-900"
        style={{
          width,
          maxWidth: "90vw",
          height,
          background:
            "linear-gradient(180deg, #FFD400 0%, #FFEA00 40%, #FFF26B 70%, #FFEA00 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(0,0,0,0.15), 4px 4px 0 0 #0A0A0A",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-full flex justify-between px-[1px]">
          {ticks.map((i) => {
            const major = i % 10 === 0;
            const mid = i % 5 === 0;
            return (
              <div
                key={i}
                className="bg-ink-900"
                style={{
                  width: major ? 1.5 : 1,
                  height: major ? "55%" : mid ? "38%" : "22%",
                }}
              />
            );
          })}
        </div>
        {[0, 25, 50, 75, 100].map((n) => (
          <div
            key={n}
            className="absolute bottom-0.5 font-mono font-bold text-[8px] text-ink-900 tabular-nums"
            style={{ left: `calc(${n}% - ${n === 0 ? 0 : n === 100 ? 14 : 7}px)` }}
          >
            {n}
          </div>
        ))}
        <div
          className="absolute top-0 left-0 h-full mix-blend-multiply"
          style={{
            width: `${p * 100}%`,
            background:
              "linear-gradient(90deg, rgba(255,95,21,0.85) 0%, rgba(255,95,21,0.55) 100%)",
            transition: isControlled ? "width 60ms linear" : "none",
          }}
        />
        {/* Always-alive sheen sweeping the filled region — long AI waits
            move the needle so slowly the gauge read as frozen. Separate
            layer on purpose: the fill above is mix-blend-multiply, and a
            white highlight under multiply is invisible (see globals.css). */}
        <div
          aria-hidden="true"
          className="t2q-tape-sheen pointer-events-none absolute top-0 left-0 h-full"
          style={{
            width: `${p * 100}%`,
            transition: isControlled ? "width 60ms linear" : "none",
          }}
        />
        <div
          className="t2q-tape-needle absolute top-0 bottom-0 w-[3px] bg-ink-900"
          style={{
            left: `${p * 100}%`,
            transform: "translateX(-1px)",
            boxShadow: "0 0 12px rgba(255,95,21,0.85)",
            transition: isControlled ? "left 60ms linear" : "none",
          }}
        />
      </div>

      {showReadout && (
        <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-ink-300">
          <span>{label}</span>
          <span className="text-hivis tabular-nums">
            {Math.round(p * 100)}mm / 100mm
          </span>
        </div>
      )}
    </div>
  );
}
