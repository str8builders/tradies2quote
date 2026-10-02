"use client";

import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { reportClientError } from "@/lib/observability/clientReport";
import { readMotionPausedChoice, subscribeMotionPaused } from "../wallpaper/motion";
import { chooseLevel, readLevelInput, type Level } from "./level";
import { JobSiteNav } from "./JobSiteNav";
import { siteLevel } from "./site-level";

// The 3D code (three.js + React Three Fiber) is its own chunk, fetched only
// on devices that get 3D, and only once the page itself is usable.
const JobSiteCanvas = dynamic(() => import("./canvas/JobSiteCanvas"), { ssr: false });

// The explicit "Pause background motion" choice only: OS Reduce Motion
// calms the story (level.ts) rather than stopping it.
const levelNow = (): Level => chooseLevel(readLevelInput(readMotionPausedChoice()));
const stillOnServer = (): Level => "still";

/**
 * Anything the 3D throws (renderer creation, a chunk that won't load on a
 * flaky connection, a shader WebKit rejects) drops to the still site
 * instead of the app-wide error page. The story itself is plain HTML and
 * never depended on the canvas.
 */
class CanvasBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    reportClientError(error, "boundary");
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
  const chosen = useSyncExternalStore(subscribeMotionPaused, levelNow, stillOnServer);
  // Once WebGL has failed on this page, stay on the still site: retrying a
  // lost context on iOS tends to fail the same way and flicker.
  const [failed, setFailed] = useState(false);
  const level: Level = failed ? "still" : chosen;
  const threeD = level !== "still";
  const [armed, setArmed] = useState(false);
  const [ready, setReady] = useState(false);
  const layer = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const onReady = useCallback(() => setReady(true), []);
  const onLost = useCallback(() => setReady(false), []);
  const onFail = useCallback(() => {
    setReady(false);
    setFailed(true);
  }, []);

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
  // the spot moves, so go back to it, unless the visitor has taken over
  // (scrolled, touched or pressed a key) in the meantime. The scroll position
  // alone can't tell: the browser's own jump to the #id can come later.
  const landing = useRef<string | null>(null);
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    landing.current = id;
    const takeOver = () => {
      landing.current = null;
    };
    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    inputs.forEach((e) => window.addEventListener(e, takeOver, { passive: true, once: true }));
    return () => inputs.forEach((e) => window.removeEventListener(e, takeOver));
  }, []);
  useEffect(() => {
    const id = landing.current;
    const el = id ? document.getElementById(id) : null;
    if (!live || !el) return;
    landing.current = null;
    // The browser's own jump to the #id is a smooth scroll that may still be
    // running: stop it, then go straight there, and check again next frame.
    const place = () => {
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - margin, behavior: "instant" });
    };
    window.scrollTo({ top: window.scrollY, behavior: "instant" });
    place();
    const frame = window.requestAnimationFrame(place);
    return () => window.cancelAnimationFrame(frame);
  }, [live]);

  return (
    <>
      {live ? (
        <div ref={layer} className="jobsite-layer" aria-hidden="true">
          <CanvasBoundary onFail={onFail}>
            <JobSiteCanvas
              level={level === "full" ? "full" : "lite"}
              layer={layer}
              flash={flash}
              onReady={onReady}
              onLost={onLost}
              onFail={onFail}
            />
          </CanvasBoundary>
        </div>
      ) : null}
      <div ref={flash} className="jobsite-flash" aria-hidden="true" />
      <JobSiteNav />
    </>
  );
}
