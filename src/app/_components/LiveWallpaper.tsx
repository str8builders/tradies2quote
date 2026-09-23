"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  useMotionPaused,
  usePageHidden,
  wallpaperModeFor,
} from "./wallpaper/motion";

// Kept here for existing importers (DemoReel, Reveal, VoiceWaveform …).
export { useMotionPaused };

/**
 * One decorative background shared by every website/app route. No data or
 * auth, no WebGL and no per-frame JavaScript: the wireframe terrain is a
 * precomputed SVG (see ./wallpaper/terrain.ts → public/wallpaper/*.svg) and
 * its slow drift is a compositor-only CSS transform. Motion pauses for the
 * OS reduced-motion setting, the footer MotionToggle (via html[data-motion])
 * and a hidden tab (via data-page).
 */
export function LiveWallpaper() {
  const paused = useMotionPaused();
  const hidden = usePageHidden();
  const mode = wallpaperModeFor(usePathname());

  useEffect(() => {
    document.documentElement.dataset.motion = paused ? "paused" : "playing";
  }, [paused]);

  if (mode === "none") return null;
  return (
    <div
      className="studio-wallpaper"
      aria-hidden="true"
      data-testid="site-live-wallpaper"
      data-wallpaper={mode}
      data-page={hidden ? "hidden" : "visible"}
    >
      <div className="studio-wallpaper-glow" />
      <div className="studio-wallpaper-grid" />
      {mode === "live" && <div className="studio-wallpaper-terrain" />}
      <div className="studio-wallpaper-vignette" />
    </div>
  );
}
