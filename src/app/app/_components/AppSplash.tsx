"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { MIN_ENTRY_MS, createWelcomeDeadline, entryComplete, entryTapeProgress } from "@/lib/welcome-playback";
import { previousPathname, routeAllowsWelcome, shouldPlayWelcome } from "@/lib/route-history";
import { WELCOME_SKIP_WINDOW_MS, readWelcomeSeen, writeWelcomeSeen } from "@/lib/welcome-cookie";
import { WelcomePoster } from "./WelcomePoster";
import { AppLoadingTape } from "./AppLoadingTape";
const WelcomePlayer = dynamic(() => import("./WelcomePlayer"), { ssr: false, loading: () => <WelcomePoster /> });
/** Pause on "Ready" before the dialog closes, so completion is seen. */
const READY_HOLD_MS = 700;
/** Failure bound: a missing chunk or a broken player can never trap entry. */
const DEADLINE_MS = 12000;

/**
 * Welcome on entry to the app.
 *
 * - `serverOpen` comes from the layout (no "seen" cookie): the first HTML then
 *   carries a full-screen cover with the assembled mark, so the dashboard is
 *   never seen before the welcome — not even for the hydration delay.
 * - After hydration the cover hands over to a modal <dialog> that plays the
 *   logo assembly; the tape fills over at least MIN_ENTRY_MS and entry waits
 *   for both the intro and the clock. Reduced motion keeps the assembly and
 *   the timing, only the flash and float are dropped.
 * - Returning from elsewhere in the site never replays it (route history).
 */
export default function AppSplash({ serverOpen = true, tagline = "Less paperwork. More time on the tools." }: {
  serverOpen?: boolean; tagline?: string;
}) {
  // Identical on the server and on hydration: a fresh document has no previous route.
  const [cover, setCover] = useState(() => serverOpen && routeAllowsWelcome(previousPathname()));
  const [mounted, setMounted] = useState(true);
  const [play, setPlay] = useState(false);
  // The player chunk has loaded and the scene is on screen: the entry clock
  // starts here, so a slow download never eats into the time the intro is seen.
  const [ready, setReady] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [clock, setClock] = useState(0);
  const calm = useReducedMotion() === true;
  // Entry completes once the intro has finished AND the minimum time (MIN_ENTRY_MS) has passed.
  const complete = entryComplete({ introDone, clock, reduce: false });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => {
    writeWelcomeSeen();
    dialogRef.current?.close();
    setCover(false);
    setMounted(false);
  }, []);
  const finished = useCallback(() => setIntroDone(true), []);
  const sceneReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const start = setTimeout(() => {
      // Entry-only: play after sign-in or on a cold start (unless seen within
      // the window), never when coming back from T2QCAL or another page —
      // a replayed modal hid the bottom nav and froze scrolling.
      const shouldPlay = shouldPlayWelcome({ previous: previousPathname(), lastSeen: readWelcomeSeen(), now: Date.now(), skipWindowMs: WELCOME_SKIP_WINDOW_MS });
      if (!shouldPlay) { close(); return; }
      const dialog = dialogRef.current;
      try { if (dialog && !dialog.open) dialog.showModal(); } catch { /* An already-open dialog still covers the screen. */ }
      setPlay(true);
      // The modal now covers the screen; the first-paint cover can go.
      setCover(false);
    }, 0);
    return () => clearTimeout(start);
  }, [close]);
  useEffect(() => {
    if (!play || complete || !mounted) return;
    const deadline = createWelcomeDeadline(finished, DEADLINE_MS);
    const visibility = () => deadline.visibility(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      deadline.dispose();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [play, complete, mounted, finished]);
  // The entry clock only advances while frames are being painted, so a
  // backgrounded tab neither races ahead nor counts toward the minimum.
  useEffect(() => {
    if (!play || !ready || complete || !mounted) return;
    let frame = 0;
    let last: number | null = null;
    let elapsed = 0;
    let shownStep = -1;
    const tick = (now: number) => {
      if (last !== null) elapsed += Math.min(now - last, 250);
      last = now;
      const next = Math.min(1, elapsed / MIN_ENTRY_MS);
      // ~1 % steps: the tape moves smoothly without re-rendering every frame.
      const step = Math.floor(next * 100);
      if (step !== shownStep) { shownStep = step; setClock(next); }
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [play, ready, complete, mounted]);
  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(close, READY_HOLD_MS);
    return () => clearTimeout(timer);
  }, [complete, close]);
  // The tape never runs ahead of the video, and never faster than the clock.
  const shown = entryTapeProgress({ video: progress, clock, introDone, reduce: false });
  if (!mounted) return null;
  const body = (art: React.ReactNode) => <div className="t2q-welcome-content">
    <div aria-hidden="true" className="t2q-welcome-art">{art}</div>
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#ecb792]">Built for your working day</p>
    <h1 id="welcome-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">Welcome to<br />Tradies<span className="text-brand">2</span>Quote.</h1>
    <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#b8bdb7]">{tagline}</p>
    <div className="t2q-welcome-loading">
      <AppLoadingTape progress={shown} complete={complete} label={complete ? "Welcome complete" : "Getting your app ready"} testId="welcome-loading-tape" />
      <p className="mt-4 text-xs text-[#c4cec6]" role="status">{complete ? "Ready. Let’s get to work." : "Getting your app ready…"}</p>
    </div>
  </div>;
  return <>
    {cover && <div data-testid="app-splash-cover" aria-hidden="true" className="fixed inset-0 z-[100] h-dvh w-screen bg-[#101312] text-white">{body(<WelcomePoster />)}</div>}
    <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
      data-testid="app-splash" data-complete={complete} aria-labelledby="welcome-heading"
      className="fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#101312] p-0 text-white backdrop:bg-[#101312]">
      {body(play ? <WelcomePlayer onComplete={finished} onProgress={setProgress} onReady={sceneReady} calm={calm} /> : <WelcomePoster />)}
    </dialog>
  </>;
}
