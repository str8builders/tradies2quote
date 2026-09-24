"use client";

import { useSyncExternalStore } from "react";
import { OUTDOOR_CHANGE_EVENT, readOutdoorMode, setOutdoorMode } from "@/lib/ui/outdoor";
import { Toggle } from "./toggle";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(OUTDOOR_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(OUTDOOR_CHANGE_EVENT, onChange);
}

export interface OutdoorModeToggleProps {
  /** The setting the server rendered with (from the t2q-outdoor cookie). */
  initialOn: boolean;
  /** Label and switch only, for tight spots such as a header bar. */
  compact?: boolean;
  className?: string;
}

/**
 * Outdoor mode on/off for this device. Saves the t2q-outdoor cookie and
 * repaints the page straight away by flipping data-contrast on every
 * [data-contrast-root]. Only ui- parts change colour. Its on/off state is
 * read from the page itself, so any number of these toggles always agree.
 */
export function OutdoorModeToggle({ initialOn, compact = false, className }: OutdoorModeToggleProps) {
  const on = useSyncExternalStore(
    subscribe,
    () => readOutdoorMode(document),
    () => initialOn,
  );
  return (
    <Toggle
      checked={on}
      onChange={(next) => setOutdoorMode(next)}
      label="Outdoor mode"
      description={
        compact
          ? undefined
          : "Black on white with stronger contrast, for bright sun. Saved on this device."
      }
      className={className}
    />
  );
}
