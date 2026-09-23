"use client";

import { useSyncExternalStore } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { readMotionPaused, setMotionPaused, subscribeMotionPaused } from "./motion";

export const MOTION_TOGGLE_LABELS = {
  playing: "Pause background motion",
  paused: "Play background motion",
} as const;

/**
 * In-flow footer control for the site's background motion. The visible text
 * is the whole accessible name and says what a press will do (the standard
 * play/pause pattern, so no aria-pressed alongside a changing label). CSS
 * hides it when the OS asks for reduced motion, which already governs.
 */
export function MotionToggle() {
  // Server-render the common case (motion playing); a stored "paused" choice
  // updates the label on hydration.
  const paused = useSyncExternalStore(subscribeMotionPaused, readMotionPaused, () => false);
  const Icon = paused ? Play : Pause;
  return (
    <button
      type="button"
      className="studio-motion-toggle"
      data-testid="motion-toggle"
      onClick={() => setMotionPaused(!paused)}
    >
      <Icon size={12} weight="fill" aria-hidden="true" />
      {paused ? MOTION_TOGGLE_LABELS.paused : MOTION_TOGGLE_LABELS.playing}
    </button>
  );
}
