"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import TapeProgress from "@/app/_components/landing/TapeProgress";

/**
 * Live tape-measure progress for an AI scan wait.
 *
 * Uses the SAME on-brand measuring-tape gauge as the loading screen
 * (`TapeProgress` — yellow tape, black graduations + numbers, orange fill
 * and glowing needle, mm readout), but driven live.
 *
 * The model gives no real progress signal, so this is an HONEST
 * time-estimate, not a fake %: the needle eases out toward ~92% over the
 * typical scan time and HOLDS there if the scan runs long (reads as
 * "almost there", never "stuck"). When `done` flips true it snaps to 100%.
 * Honors prefers-reduced-motion (static partial fill, no animation).
 *
 * `look="new"` draws the same estimate with ui- tokens (<TapeBlade>), so it
 * reads in the new look's dark and outdoor modes.
 */
export function TapeMeasureProgress({
  done = false,
  estimateMs = 22000,
  label = "// scanning",
  look = "classic",
}: {
  done?: boolean;
  estimateMs?: number;
  /** Classic: the readout under the tape. New: the tape's name for screen readers. */
  label?: string;
  look?: "classic" | "new";
}) {
  const reduce = useReducedMotion();
  const [animP, setAnimP] = useState(0.02);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Nothing to animate for the static cases — those are derived below.
    if (done || reduce) return;
    const start = performance.now();
    const cap = 0.92; // hold here until the real result lands
    const tick = (t: number) => {
      const lin = Math.min(1, (t - start) / estimateMs);
      const eased = 1 - Math.pow(1 - lin, 3); // easeOutCubic — quick then slow
      setAnimP(Math.max(0.02, eased * cap));
      if (lin < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [done, reduce, estimateMs]);

  const p = done ? 1 : reduce ? 0.65 : animP;

  if (look === "new") return <TapeBlade progress={p} done={done} label={label} />;
  return <TapeProgress progress={p} width={360} label={label} />;
}

/**
 * The new look's tape: the hi-vis blade (`ui-tape`) with an orange fill whose
 * edge is the needle. It slides by transform only. Being an estimate, it
 * gives screen readers a number only once the read is really done.
 */
function TapeBlade({ progress, done, label }: { progress: number; done: boolean; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuetext={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={done ? 100 : undefined}
      data-complete={done}
      className="ui-tape relative h-9 w-full overflow-hidden rounded-ui-sm border-2 border-ui-line-strong"
    >
      <span
        aria-hidden="true"
        style={{ transform: `translateX(${(progress - 1) * 100}%)` }}
        className="absolute inset-0 border-r-[3px] border-ui-on-brand bg-ui-brand mix-blend-multiply transition-transform duration-ui-base ease-linear motion-reduce:transition-none"
      />
    </div>
  );
}
