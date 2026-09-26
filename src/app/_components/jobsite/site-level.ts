import { useSyncExternalStore } from "react";
import type { Level } from "./level";

/**
 * The level the page is actually showing (full / lite / still), set by
 * JobSiteExperience at the same moment it sets the root's data-level, so
 * the house plays video exactly when its CSS paces the rooms for motion.
 */
let current: Level = "still";
const listeners = new Set<() => void>();

export const siteLevel = {
  get: (): Level => current,
  set(level: Level) {
    if (level === current) return;
    current = level;
    listeners.forEach((fn) => fn());
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

const stillOnServer = (): Level => "still";

export function useSiteLevel(): Level {
  return useSyncExternalStore(siteLevel.subscribe, siteLevel.get, stillOnServer);
}
