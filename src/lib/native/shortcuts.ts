/**
 * Home Screen quick actions (browser code): press and hold the app icon for
 * New quote, Timesheet, Jobs or Scan a supplier quote. The Swift side
 * (T2QShortcutsPlugin.swift) keeps the page an action asked for until this
 * code collects it, and nudges the page when the app was already open.
 */

import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { hasNativeModule } from "./plugins";

/** The pages the quick actions may open: the same list as T2QShortcuts.paths in Swift. */
export const SHORTCUT_PATHS = ["/app/quotes/new", "/app/timesheet", "/app/jobs", "/app/materials/capture"] as const;
export type ShortcutPath = (typeof SHORTCUT_PATHS)[number];

export function isShortcutPath(path: unknown): path is ShortcutPath {
  return typeof path === "string" && (SHORTCUT_PATHS as readonly string[]).includes(path);
}

interface T2QShortcutsPlugin {
  /** The page an action asked for, once (`{}` when none is waiting). */
  consume(): Promise<{ path?: string }>;
  addListener(event: "shortcut", listener: () => void): Promise<PluginListenerHandle>;
}

const T2QShortcuts = registerPlugin<T2QShortcutsPlugin>("T2QShortcuts");

export function hasNativeShortcuts(): boolean {
  return hasNativeModule("T2QShortcuts");
}

/** The page a quick action is waiting to open, or null. Never throws. */
export async function takeShortcutPath(): Promise<ShortcutPath | null> {
  if (!hasNativeShortcuts()) return null;
  try {
    const { path } = await T2QShortcuts.consume();
    return isShortcutPath(path) ? path : null;
  } catch {
    return null;
  }
}

/** Calls `onPath` for each quick action while the app is open. Returns what stops it. Never throws. */
export async function watchShortcuts(onPath: (path: ShortcutPath) => void): Promise<() => void> {
  if (!hasNativeShortcuts()) return () => {};
  try {
    const handle = await T2QShortcuts.addListener("shortcut", () => {
      void takeShortcutPath().then((path) => {
        if (path) onPath(path);
      });
    });
    return () => {
      void handle.remove();
    };
  } catch {
    return () => {};
  }
}

/**
 * Opens every page a quick action asks for: the one that launched the app, and any that arrive while it is
 * open. Returns what stops listening.
 *
 * The phone hands an action over only once, so one that has been collected is always opened, even if what
 * asked for it was cleaned up while it was on its way (React runs a screen's effects twice in development, and
 * a screen can be replaced at any time): dropping it would lose the person's tap.
 */
export function connectShortcuts(open: (path: ShortcutPath) => void): () => void {
  if (!hasNativeShortcuts()) return () => {};
  let stopped = false;
  let remove: (() => void) | null = null;
  void takeShortcutPath().then((path) => {
    if (path) open(path);
  });
  void watchShortcuts(open).then((stop) => {
    if (stopped) stop();
    else remove = stop;
  });
  return () => {
    stopped = true;
    remove?.();
  };
}
