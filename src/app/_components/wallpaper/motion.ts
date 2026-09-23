import { useSyncExternalStore } from "react";

/**
 * Site-wide "background motion" preference, shared by the wallpaper, the
 * footer MotionToggle and every component that calls `useMotionPaused`
 * (DemoReel, Reveal, VoiceWaveform …). The storage key and change event are
 * a public contract: other tabs and components listen for them.
 */
export const MOTION_STORAGE_KEY = "t2q-motion-paused";
export const MOTION_CHANGE_EVENT = "t2q-motion-change";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * This document's own choice. It outranks storage so a toggle still works
 * when localStorage throws (private mode, blocked site data).
 */
let sessionChoice: boolean | undefined;

/** Precedence: OS reduced motion › this tab's choice › stored choice › playing. */
export function resolveMotionPaused(input: {
  reducedMotion: boolean;
  sessionChoice: boolean | undefined;
  stored: string | null;
}) {
  if (input.reducedMotion) return true;
  if (input.sessionChoice !== undefined) return input.sessionChoice;
  return input.stored === "true";
}

function readStored() {
  try {
    return window.localStorage.getItem(MOTION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function readMotionPaused() {
  return resolveMotionPaused({
    reducedMotion: window.matchMedia(REDUCED_MOTION_QUERY).matches,
    sessionChoice,
    stored: readStored(),
  });
}

export function subscribeMotionPaused(callback: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MOTION_STORAGE_KEY && event.key !== null) return;
    // Another tab chose: its stored value now wins over this tab's choice.
    sessionChoice = undefined;
    callback();
  };
  media.addEventListener("change", callback);
  window.addEventListener(MOTION_CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener(MOTION_CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function setMotionPaused(paused: boolean) {
  sessionChoice = paused;
  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, String(paused));
  } catch {
    /* The session choice above still applies to this tab. */
  }
  window.dispatchEvent(new Event(MOTION_CHANGE_EVENT));
}

/** Paused until the client knows otherwise (server snapshot `true`). */
export function useMotionPaused() {
  return useSyncExternalStore(subscribeMotionPaused, readMotionPaused, () => true);
}

function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}

/** True while the tab is in the background. */
export function usePageHidden() {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.hidden,
    () => false,
  );
}

export type WallpaperMode = "live" | "still" | "none";

/**
 * Route policy (unchanged from the WebGL version): the full animated scene
 * on public pages, static CSS layers behind the app and print sheets, and
 * nothing on client-facing documents. /t2qcal is excluded by <TradiesOnly>.
 */
export function wallpaperModeFor(pathname: string): WallpaperMode {
  if (pathname.startsWith("/quote/") || pathname.endsWith("/pdf")) return "none";
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname.startsWith("/print/")) {
    return "still";
  }
  return "live";
}
