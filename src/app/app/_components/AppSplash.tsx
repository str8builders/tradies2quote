"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useReducedMotion } from "framer-motion";
import { createWelcomeDeadline } from "@/lib/welcome-playback";
import { WelcomePoster } from "./WelcomePoster";
import { AppLoadingTape } from "./AppLoadingTape";
const WelcomePlayer = dynamic(() => import("./WelcomePlayer"), { ssr: false, loading: () => <WelcomePoster /> });
const SKIP_WINDOW_MS = 6 * 3600 * 1000;

/** Automatic entry follows the full intro, with a visible-time failure bound. */
export default function AppSplash({ storageKey = "t2q-welcome-v5", tagline = "Less paperwork. More time on the tools." }: {
  storageKey?: string; tagline?: string;
} = {}) {
  const [mounted, setMounted] = useState(true);
  const [play, setPlay] = useState(false);
  const [complete, setComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => {
    try { sessionStorage.setItem(storageKey, String(Date.now())); } catch { /* Storage is optional. */ }
    dialogRef.current?.close();
    setMounted(false);
  }, [storageKey]);
  const finished = useCallback(() => setComplete(true), []);
  useEffect(() => {
    const start = setTimeout(() => {
      let seen = false;
      try {
        const lastSeen = Number(sessionStorage.getItem(storageKey));
        const elapsed = Date.now() - lastSeen;
        seen = lastSeen > 0 && elapsed >= 0 && elapsed < SKIP_WINDOW_MS;
      } catch { /* Entry also works without browser storage. */ }
      if (seen) { close(); return; }
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
  useEffect(() => {
    if (!complete) return;
    const timer = setTimeout(close, 350);
    return () => clearTimeout(timer);
  }, [complete, close]);
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
        <AppLoadingTape progress={progress} complete={complete} label={complete ? "Welcome complete" : "Getting your app ready"} testId="welcome-loading-tape" />
        <p className="mt-4 text-xs text-[#c4cec6]" role="status">{complete ? "Ready. Let’s get to work." : "Getting your app ready…"}</p>
      </div>
    </div>
  </dialog>;
}
