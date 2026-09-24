"use client";

import { useSyncExternalStore } from "react";
import { Toggle } from "@/components/ui/toggle";
import { OUTDOOR_CHANGE_EVENT, readOutdoorMode, setOutdoorMode } from "@/lib/ui/outdoor";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(OUTDOOR_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(OUTDOOR_CHANGE_EVENT, onChange);
}

/**
 * Outdoor mode, in the words the Account page uses. Same store as the kit's
 * <OutdoorModeToggle> (the t2q-outdoor cookie and the page's contrast
 * roots), so every switch on the page agrees and the page repaints at once.
 */
export function OutdoorSetting({ initialOn }: { initialOn: boolean }) {
  const on = useSyncExternalStore(subscribe, () => readOutdoorMode(document), () => initialOn);
  return (
    <div data-testid="settings-outdoor">
      <Toggle
        checked={on}
        onChange={(next) => setOutdoorMode(next)}
        label="Outdoor mode"
        description="High contrast for bright sun. Only changes this device."
      />
    </div>
  );
}
