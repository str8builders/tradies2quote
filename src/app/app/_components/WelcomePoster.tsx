"use client";
import { LogoAssembly, WELCOME_FPS, WELCOME_FRAMES } from "@/remotion/WelcomeScene";

/** Lightweight first paint and the reduced-motion alternative: the assembled mark, no animation. */
export function WelcomePoster() {
  return <div className="t2q-welcome-poster" aria-hidden="true">
    <LogoAssembly frame={WELCOME_FRAMES - 1} fps={WELCOME_FPS} />
  </div>;
}
