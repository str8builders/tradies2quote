"use client";

import { useReducedMotion } from "framer-motion";
import TapeProgress from "@/app/_components/landing/TapeProgress";

/** Only known animation progress or actual completion gets a numeric value. */
export function AppLoadingTape({ label, progress, complete = false, testId }: {
  label: string;
  progress?: number;
  complete?: boolean;
  testId?: string;
}) {
  const reduce = useReducedMotion();
  const value = complete ? 1 : progress === undefined ? undefined : Math.max(0, Math.min(1, progress));
  return <div role="progressbar" aria-label={label} aria-valuetext={label}
    aria-valuemin={0} aria-valuemax={100}
    aria-valuenow={value === undefined ? undefined : Math.round(value * 100)}
    data-testid={testId} className="t2q-loading-tape" data-complete={complete}>
    <div aria-hidden="true">
      <TapeProgress progress={complete ? 1 : reduce ? 0.5 : value}
        width={360} height={36} duration={2800} showReadout={false} />
    </div>
  </div>;
}
