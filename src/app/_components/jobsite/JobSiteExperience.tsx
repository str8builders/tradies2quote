"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { readMotionPaused, subscribeMotionPaused } from "../wallpaper/motion";
import { chooseLevel, readLevelInput, type Level } from "./level";
import { JobSiteNav } from "./JobSiteNav";
import { siteLevel } from "./site-level";

// The 3D code (three.js + React Three Fiber) is its own chunk, fetched only
// on devices that get 3D, and only once the page itself is usable.
const JobSiteCanvas = dynamic(() => import("./canvas/JobSiteCanvas"), { ssr: false });

const levelNow = (): Level => chooseLevel(readLevelInput(readMotionPaused()));
const stillOnServer = (): Level => "still";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * The 3D world behind the story. Picks full, lite or still for this device
 * (and follows the "Pause background motion" switch), loads the canvas
 * after the page is idle, and owns the overlays the camera drives: the
 * flash into the phone and the fade at the end of the tunnel.
 */
export function JobSiteExperience() {
  const level = useSyncExternalStore(subscribeMotionPaused, levelNow, stillOnServer);
  const threeD = level !== "still";
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onLost = useCallback(() => setReady(false), []);

  useEffect(() => {
    if (!threeD) return;
    const w = window as IdleWindow;
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setArmed(true), { timeout: 2000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => setArmed(true), 600);
    return () => window.clearTimeout(id);
  }, [threeD]);

  const live = threeD && armed;
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-jobsite-root]");
    if (!root) return;
    root.dataset.level = live ? level : "still";
    siteLevel.set(live ? level : "still");
    root.toggleAttribute("data-ready", live && ready);
    if (!live && flash.current) flash.current.style.opacity = "0";
  }, [live, level, ready]);

  // A deep link (/site-preview#draft, #pricing) lands while the page is in
  // its compact still layout. Once the motion layout makes the scenes taller
  // the spot moves, so go back to it, unless the visitor has scrolled since.
  const landing = useRef<{ id: string; y: number } | null>(null);
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) landing.current = { id, y: window.scrollY };
  }, []);
  useEffect(() => {
    const target = landing.current;
    if (!live || !target) return;
    landing.current = null;
    if (Math.abs(window.scrollY - target.y) > 4) return;
    document.getElementById(target.id)?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [live]);

  return (
    <>
      {live ? (
        <div ref={layer} className="jobsite-layer" aria-hidden="true">
          <JobSiteCanvas
            level={level === "full" ? "full" : "lite"}
            layer={layer}
            flash={flash}
            onReady={onReady}
            onLost={onLost}
          />
        </div>
      ) : null}
      <div ref={flash} className="jobsite-flash" aria-hidden="true" />
      <JobSiteNav />
    </>
  );
}
