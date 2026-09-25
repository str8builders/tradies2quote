"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { cx } from "@/components/ui/cx";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { UI_TEXT } from "@/components/ui/styles";
import { previousPathname, routeAllowsWelcome, shouldPlayWelcome } from "@/lib/route-history";
import { WELCOME_SKIP_WINDOW_MS, readWelcomeSeen, writeWelcomeSeen } from "@/lib/welcome-cookie";
import { createWelcomeDeadline } from "@/lib/welcome-playback";
import type { TopBarData } from "../lib/top-bar";

// The Remotion player is a separate download; the page colour shows until it's in.
const NewWelcomePlayer = dynamic(() => import("./NewWelcomePlayer"), { ssr: false, loading: () => null });

/** A failed or stalled download can never trap entry: gone after this (visible time). */
export const WELCOME_DEADLINE_MS = 12000;
/** A beat on the last frame before the fade, so the finish is seen. */
export const WELCOME_HOLD_MS = 400;
/** The fade out (the ui-fade-out animation). */
const FADE_MS = 250;

export type WelcomeData = Pick<TopBarData, "greeting" | "name" | "today">;

/**
 * The welcome after signing in (new look): the Remotion scene in
 * src/remotion/NewWelcomeScene.tsx, about 6.5 s. A blueprint grid draws, a
 * tape measure shoots across, the T and Q slam in, the orange 2 drops like
 * a steel plate, a caution stripe sweeps through, then "Good morning,
 * Challis" types in with today's date. Then it fades into Home. A tap
 * anywhere, or any key, skips it.
 *
 * - It's in the first HTML (the page colour and glow), so Home is never
 *   seen first; the animation starts once its player is on screen.
 * - It plays on a real entry only: after signing in, or opening the app
 *   fresh (not within 6 hours of the last time), never when coming back
 *   from somewhere else (the same rules as the old welcome).
 * - With Reduce Motion it still plays in full (the owner wants to see it);
 *   only the shake, dust and sparks are left out.
 */
export function NewLookWelcome({ serverOpen, data }: { serverOpen: boolean; data: WelcomeData }) {
  // Identical on the server and on hydration: a fresh document has no previous route.
  const [shown, setShown] = useState(() => serverOpen && routeAllowsWelcome(previousPathname()));
  const [playing, setPlaying] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const calm = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);

  const finish = useCallback(() => {
    writeWelcomeSeen();
    setShown(false);
  }, []);
  const skip = useCallback(() => setLeaving(true), []);
  const ended = useCallback(() => {
    window.setTimeout(() => setLeaving(true), WELCOME_HOLD_MS);
  }, []);

  // Decide once on arrival; then play, with the safety deadline running.
  useEffect(() => {
    if (!shown) return;
    const play = shouldPlayWelcome({
      previous: previousPathname(),
      lastSeen: readWelcomeSeen(),
      now: Date.now(),
      skipWindowMs: WELCOME_SKIP_WINDOW_MS,
    });
    const start = window.setTimeout(() => (play ? setPlaying(true) : finish()), 0);
    if (!play) return () => window.clearTimeout(start);
    const deadline = createWelcomeDeadline(skip, WELCOME_DEADLINE_MS);
    const visibility = () => deadline.visibility(document.hidden);
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(start);
      deadline.dispose();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [shown, finish, skip]);

  // Fading out, then gone. Reduced motion skips the fade.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(finish, calm ? 0 : FADE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, calm, finish]);

  // Into the browser's top layer, above everything on the page (the cookie
  // banner included), like the old welcome. The first HTML already shows it
  // as an open, fixed dialog, so nothing is seen before this.
  useEffect(() => {
    const el = dialog.current;
    if (!shown || !el) return;
    try {
      if (!el.matches(":modal")) {
        el.close();
        el.showModal();
      }
      // Focus the welcome itself, not the skip button (no ring on arrival).
      el.focus();
    } catch {
      // Still covers the screen as a fixed, open dialog.
    }
  }, [shown]);

  // Any key skips it too.
  useEffect(() => {
    if (!shown) return;
    const onKey = () => skip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, skip]);

  if (!shown) return null;

  const words = data.name ? `${data.greeting}, ${data.name}` : `${data.greeting}. Let’s get to work.`;
  return (
    <dialog
      ref={dialog}
      open
      tabIndex={-1}
      aria-labelledby="welcome-greeting"
      data-testid="new-look-welcome"
      data-leaving={leaving ? "true" : "false"}
      onClick={skip}
      onCancel={(event) => {
        // Escape: skip, and keep React in charge of when it closes.
        event.preventDefault();
        skip();
      }}
      className={cx(
        "ui-glow fixed inset-0 z-[100] m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-ui-bg p-0 outline-none backdrop:bg-ui-bg",
        leaving && "animate-ui-fade-out motion-reduce:animate-none",
        UI_TEXT,
      )}
    >
      <h1 id="welcome-greeting" className="sr-only">
        {words}. {data.today}.
      </h1>
      <div aria-hidden="true" className="absolute inset-0">
        {playing ? (
          <NewWelcomePlayer greeting={data.greeting} name={data.name} today={data.today} calm={calm} onEnded={ended} />
        ) : null}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          skip();
        }}
        className="ui-focus-ring absolute bottom-[max(env(safe-area-inset-bottom),1.5rem)] left-1/2 min-h-12 -translate-x-1/2 rounded-ui-md px-4 text-ui-sm text-ui-muted"
      >
        Tap anywhere to skip
      </button>
    </dialog>
  );
}
