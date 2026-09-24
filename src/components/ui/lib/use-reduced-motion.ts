"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * True when the phone asks for reduced motion. For motion driven by
 * JavaScript (timers, live levels); CSS motion uses `motion-reduce:` variants.
 * False on the server and during hydration, so the first render matches.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches,
    () => false,
  );
}
