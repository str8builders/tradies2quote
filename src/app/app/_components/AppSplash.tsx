"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { WelcomePoster } from "./WelcomePoster";
const WelcomePlayer = dynamic(() => import("./WelcomePlayer"), { ssr: false, loading: () => <WelcomePoster /> });
const SKIP_WINDOW_MS = 6 * 3600 * 1000;

/** A skippable welcome: the user owns entry, including on slow connections. */
export default function AppSplash({ storageKey = "t2q-welcome-v4", tagline = "Less paperwork. More time on the tools." }: {
  storageKey?: string; tagline?: string;
} = {}) {
  const [mounted, setMounted] = useState(true);
  const [play, setPlay] = useState(false);
  const [complete, setComplete] = useState(false);
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
      } catch { /* Keep a skippable welcome. */ }
      if (seen) { close(); return; }
      dialogRef.current?.showModal();
      setPlay(true);
    }, 0);
    return () => clearTimeout(start);
  }, [close, storageKey]);
  if (!mounted) return null;
  // Closed in server HTML: returning visits never flash an already-seen intro.
  return <dialog ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
    data-testid="app-splash" data-complete={complete} aria-labelledby="welcome-heading"
    className="fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#101312] p-0 text-white backdrop:bg-[#101312]">
    <div className="t2q-welcome-content">
      <div aria-hidden="true" className="t2q-welcome-art">{play ? <WelcomePlayer onComplete={finished} /> : <WelcomePoster />}</div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#ecb792]">Built for your working day</p>
      <h1 id="welcome-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">Welcome to<br />Tradies<span className="text-brand">2</span>Quote.</h1>
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#b8bdb7]">{tagline}</p>
      <button onClick={close} autoFocus className="t2q-btn-primary-pro mt-7 px-7">Enter app <span aria-hidden="true">→</span></button>
    </div>
  </dialog>;
}
