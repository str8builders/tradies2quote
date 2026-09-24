/**
 * The job progress line: Quote → Sent → Accepted → Booked → Done → Paid.
 *
 * `position` is the step the job is waiting on (the "now" dot, which the big
 * orange button completes); every step before it is done. "complete" means
 * the job is paid and nothing is left.
 */

export const JOB_STAGES = ["Quote", "Sent", "Accepted", "Booked", "Done", "Paid"] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export type RailPosition = JobStage | "complete";
export type RailState = "done" | "current" | "upcoming";

function positionIndex(position: RailPosition): number {
  return position === "complete" ? JOB_STAGES.length : JOB_STAGES.indexOf(position);
}

export function railStates(position: RailPosition): Array<{ stage: JobStage; state: RailState }> {
  const current = positionIndex(position);
  return JOB_STAGES.map((stage, i) => ({
    stage,
    state: i < current ? "done" : i === current ? "current" : "upcoming",
  }));
}

/** How far the line is filled, 0–1: up to the current dot, all the way once complete. */
export function railProgress(position: RailPosition): number {
  const current = Math.min(positionIndex(position), JOB_STAGES.length - 1);
  return current / (JOB_STAGES.length - 1);
}

/** The position after the current step is done. */
export function nextRailPosition(position: RailPosition): RailPosition {
  const i = positionIndex(position);
  return i >= JOB_STAGES.length - 1 ? "complete" : JOB_STAGES[i + 1];
}
