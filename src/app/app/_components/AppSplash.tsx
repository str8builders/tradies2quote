"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const WelcomePlayer = dynamic(() => import("./WelcomePlayer"), { ssr: false, loading: () => null });
const SKIP_WINDOW_MS = 6 * 3600 * 1000;
/** Native modal contains focus without changing the app scroll shell. */
export default function AppSplash({ storageKey = "t2q-welcome-v2", tagline = "Less paperwork. More time on the tools.", holdMs = 6000 }: {
  storageKey?: string; tagline?: string; holdMs?: number;
} = {}) {
  const [mounted, setMounted] = useState(true);
  const [play, setPlay] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useCallback(() => {
    try { sessionStorage.setItem(storageKey, String(Date.now())); } catch { /* Storage is optional. */ }
    dialogRef.current?.close();
    setMounted(false);
  }, [storageKey]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const start = setTimeout(() => {
      let seen = false;
      try { seen = Date.now() - Number(sessionStorage.getItem(storageKey) ?? 0) < SKIP_WINDOW_MS; } catch { /* Keep a skippable welcome. */ }
      if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { close(); return; }
      const dialog = dialogRef.current;
      if (!dialog) return;
      dialog.close();
      dialog.showModal();
      setPlay(true);
      // Always exit even if the animation or WebGL cannot load.
      timer = setTimeout(close, Math.min(Math.max(holdMs, 1000), 6000));
    }, 0);
    return () => { clearTimeout(start); clearTimeout(timer); };
  }, [close, holdMs, storageKey]);
  if (!mounted) return null;
  return <dialog open ref={dialogRef} onCancel={(event) => { event.preventDefault(); close(); }}
    data-testid="app-splash" aria-labelledby="welcome-heading"
    className="fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#101312] p-0 text-white backdrop:bg-[#101312]">
    <div className="relative flex min-h-full flex-col items-center justify-center overflow-clip px-6 py-10 text-center"
      style={{ background: "radial-gradient(ellipse at 50% 32%, #52311f88, transparent 62%)" }}>
      <div aria-hidden="true" className="w-full max-w-[460px]">{play ? <WelcomePlayer onComplete={close} /> : <div style={{ aspectRatio: "720 / 520" }} />}</div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#ecb792]">Built for your working day</p>
      <h1 id="welcome-heading" className="text-3xl font-semibold tracking-tight sm:text-5xl">Welcome to<br />Tradies<span className="text-brand">2</span>Quote.</h1>
      <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#b8bdb7]">{tagline}</p>
      <button onClick={close} autoFocus className="mt-8 min-h-11 rounded-full border border-white/20 px-6 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">Enter app <span aria-hidden="true">→</span></button>
    </div>
  </dialog>;
}
