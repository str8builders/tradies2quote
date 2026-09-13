"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { MIN_ENTRY_MS, createWelcomeDeadline, entryComplete, entryTapeProgress } from "@/lib/welcome-playback";
import { previousPathname, shouldPlayWelcome } from "@/lib/route-history";
import { WelcomePoster } from "./WelcomePoster";
import { AppLoadingTape } from "./AppLoadingTape";
const WelcomePlayer = dynamic(() => import("./WelcomePlayer"), { ssr: false, loading: () => <WelcomePoster /> });
const SKIP_WINDOW_MS = 6 * 3600 * 1000;
/** Pause on "Ready" before the dialog closes, so completion is seen. */
const READY_HOLD_MS = 700;

/** Automatic entry follows the full intro, with a visible-time failure bound. */
export default function AppSplash({ storageKey = "t2q-welcome-v5", tagline = "Less paperwork. More time on the tools." }: {
  storageKey?: string; tagline?: string;
} = {}) {
  const [mounted, setMounted] = useState(true);
  const [play, setPlay] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clock, setClock] = useState(0);
  const reduce = useReducedMotion();
  // Entry completes once the intro has finished AND the minimum time (MIN_ENTRY_MS) has passed.
  const complete = entryComplete({ introDone, clock, reduce: reduce === true });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => {
    try { sessionStorage.setItem(storageKey, String(Date.now())); } catch { /* Storage is optional. */ }
    dialogRef.current?.close();
    setMounted(false);
  }, [storageKey]);
  const finished = useCallback(() => setIntroDone(true), []);
  useEffect(() => {
    const start = setTimeout(() => {
      // Entry-only: play after sign-in or on a cold start (unless seen within
      // the window), never when coming back from T2QCAL or another page —
      // a replayed modal hid the bottom nav and froze scrolling.
      let lastSeen = 0;
      try { lastSeen = Number(sessionStorage.getItem(storageKey)) || 0; } catch { /* Entry also works without browser storage. */ }
      const play = shouldPlayWelcome({ previous: previousPathname(), lastSeen, now: Date.now(), skipWindowMs: SKIP_WINDOW_MS });
      if (!play) { close(); return; }
      dialogRef.current?.showModal();
      setPlay(true);
    }, 0);
    return () => clearTimeout(start);
  }, [close, storageKey]);
  useEffect(() => {
    if (!play || complete || !mounted) return;
    // Reduced motion uses the poster. Missing WebGL/chunks cannot leave a modal stuck.
    const deadline = createWelcomeDeadline(finished, reduce ? 1200 : 12000);
    const visibility = () => deadline.visibility(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      deadline.dispose();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [play, complete, mounted, reduce, finished]);
  // The entry clock only advances while frames are being painted, so a
  // backgrounded tab neither races ahead nor counts toward the minimum.
  useEffect(() => {
    if (!play || complete || !mounted || reduce) return;
    let frame = 0;
    let last: number | null = null;
    let elapsed = 0;
    const tick = (now: number) => {
      if (last !== null) elapsed += Math.min(now - last, 250);
      last = now;
      const next = Math.min(1, elapsed / MIN_ENTRY_MS);
      setClock(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, complete, mounted, reduce]);
  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(close, READY_HOLD_MS);
    return () => clearTimeout(timer);
  }, [complete, close]);
  // The tape never runs ahead of the video, and never faster than the clock.
  const shown = entryTapeProgress({ video: progress, clock, introDone, reduce: reduce === true });
  if (!mounted) return null;
  // Closed in server HTML: returning visits never flash an already-seen intro.
  return <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
    data-testid="app-splash" data-complete={complete} aria-labelledby="welcome-heading"
    className="fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#101312] p-0 text-white backdrop:bg-[#101312]">
    <div className="t2q-welcome-content">
      <div aria-hidden="true" className="t2q-welcome-art">{play && !reduce ? <WelcomePlayer onComplete={finished} onProgress={setProgress} /> : <WelcomePoster />}</div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#ecb792]">Built for your working day</p>
      <h1 id="welcome-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">Welcome to<br />Tradies<span className="text-brand">2</span>Quote.</h1>
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#b8bdb7]">{tagline}</p>
      <div className="t2q-welcome-loading">
        <AppLoadingTape progress={shown} complete={complete} label={complete ? "Welcome complete" : "Getting your app ready"} testId="welcome-loading-tape" />
        <p className="mt-4 text-xs text-[#c4cec6]" role="status">{complete ? "Ready. Let’s get to work." : "Getting your app ready…"}</p>
      </div>
    </div>
  </dialog>;
}
