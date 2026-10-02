import { REDUCED_MOTION_QUERY } from "../wallpaper/motion";

/**
 * "Calm" = the visitor's OS asks for reduced motion. The job-site story
 * still plays (it only moves when they scroll), but nothing moves on its
 * own: no bob or sway on the floating phone, no spin between rooms, and a
 * dark fade instead of the bright flash into the phone (jobsite.css).
 * Read every frame by the canvas, so the MediaQueryList is cached.
 */
let query: MediaQueryList | null = null;

export function isCalm(): boolean {
  if (typeof window === "undefined") return false;
  query ??= window.matchMedia(REDUCED_MOTION_QUERY);
  return query.matches;
}
