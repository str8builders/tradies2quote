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
 *
 * The end dots sit on the edges so the middle labels get the most room
 * ("Accepted" and "Booked" are the widest neighbours); in a box narrower than
 * 20rem every other label drops to a second row rather than colliding.
 */
export function StatusRail({
  position,
  animate = true,
  label = "Job progress",
  className,
}: StatusRailProps) {
  const states = railStates(position);
  const progress = railProgress(position);
  const last = states.length - 1;
  return (
    <div className={cx("@container relative w-full font-ui-sans", className)} data-position={position}>
      {/* The line runs between the first and last dot centres (dots are 36 px). */}
      <div
        aria-hidden="true"
        className="absolute top-[1.125rem] right-[1.125rem] left-[1.125rem] h-1 -translate-y-1/2 overflow-hidden rounded-full bg-ui-line"
      >
        <div
          data-rail-fill=""
          className={cx(
            "h-full w-full origin-left rounded-full bg-ui-ok",
            animate && "transition-transform duration-ui-slow ease-ui-out motion-reduce:transition-none",
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
      <ol aria-label={label} className="relative flex items-start justify-between">
        {states.map(({ stage, state }, i) => (
          <li
            key={stage}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            className={cx(
              "flex w-9 shrink-0 flex-col gap-1.5",
              i === 0 ? "items-start" : i === last ? "items-end" : "items-center",
            )}
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
            <span
              className={cx(
                "text-ui-xs whitespace-nowrap",
                LABEL[state],
                i % 2 === 1 && "@max-xs:mt-[1.125rem]",
              )}
            >
              {stage}
            </span>
            <span className="sr-only">, {SPOKEN[state]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
