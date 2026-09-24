import { Check } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { railProgress, railStates, type RailPosition, type RailState } from "./lib/job-stages";

export type { JobStage, RailPosition } from "./lib/job-stages";

const DOT: Record<RailState, string> = {
  done: "border-ui-ok bg-ui-ok text-ui-bg",
  current: "scale-110 border-ui-brand bg-ui-brand-soft",
  upcoming: "border-ui-line-strong bg-ui-surface-2",
};

const LABEL: Record<RailState, string> = {
  done: "text-ui-muted",
  current: "font-semibold text-ui-text",
  upcoming: "text-ui-faint",
};

/** Read after each step's name by screen readers. */
const SPOKEN: Record<RailState, string> = {
  done: "done",
  current: "next up",
  upcoming: "not yet",
};

export interface StatusRailProps {
  /** The step the job is waiting on; "complete" once paid. */
  position: RailPosition;
  /** Fill the line and grow the current dot smoothly when the step changes. */
  animate?: boolean;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}

/**
 * Job progress from quote to paid: done steps get a tick, the waiting step is
 * ringed in orange, later steps are grey. Always shows what's next.
 */
export function StatusRail({
  position,
  animate = true,
  label = "Job progress",
  className,
}: StatusRailProps) {
  const states = railStates(position);
  const progress = railProgress(position);
  const motion = animate
    ? "transition-transform duration-ui-slow ease-ui-out motion-reduce:transition-none"
    : "";
  return (
    <div className={cx("relative font-ui-sans", className)} data-position={position}>
      {/* The line runs between the first and last dot centres (1/12 in from each side). */}
      <div
        aria-hidden="true"
        className="absolute top-[1.125rem] right-[calc(100%/12)] left-[calc(100%/12)] h-1 -translate-y-1/2 overflow-hidden rounded-full bg-ui-line"
      >
        <div
          data-rail-fill=""
          className={cx("h-full w-full origin-left rounded-full bg-ui-ok", motion)}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <ol aria-label={label} className="relative grid grid-cols-6">
        {states.map(({ stage, state }) => (
          <li
            key={stage}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className="flex min-w-0 flex-col items-center gap-1.5 text-center"
          >
            <span
              aria-hidden="true"
              className={cx(
                "flex h-9 w-9 items-center justify-center rounded-full border-2",
                DOT[state],
                animate && "transition-transform duration-ui-base ease-ui-out motion-reduce:transition-none",
              )}
            >
              {state === "done" ? (
                <Check weight="bold" className="text-[1.125rem]" />
              ) : state === "current" ? (
                <span className="h-2.5 w-2.5 rounded-full bg-ui-brand" />
              ) : null}
            </span>
            <span className={cx("text-ui-xs", LABEL[state])}>{stage}</span>
            <span className="sr-only">, {SPOKEN[state]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
