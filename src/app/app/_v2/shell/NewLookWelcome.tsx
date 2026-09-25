"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CalendarBlank, Lightning } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { useReducedMotion } from "@/components/ui/lib/use-reduced-motion";
import { UI_TEXT } from "@/components/ui/styles";
import { previousPathname, routeAllowsWelcome, shouldPlayWelcome } from "@/lib/route-history";
import { WELCOME_SKIP_WINDOW_MS, readWelcomeSeen, writeWelcomeSeen } from "@/lib/welcome-cookie";
import type { TopBarData } from "../lib/top-bar";

/** How long the welcome shows before it fades into Home (ms). */
export const WELCOME_SHOW_MS = 2400;
/** With reduced motion: a still card, briefly. */
export const WELCOME_CALM_MS = 900;
/** The fade out (the ui-fade-out animation). */
const FADE_MS = 250;

/** When each part starts (ms): logo, tape, the three words, the chips. */
const AT = { logo: 0, tape: 350, word: [900, 1000, 1100], chips: 1350 } as const;
const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

export type WelcomeData = Pick<TopBarData, "greeting" | "name" | "today">;

/**
 * The welcome after signing in (new look). Your T2Q logo lands, an orange
 * tape measure rolls out, then it greets you by name with today's date, and
 * fades into Home: about 2.5 seconds, and a tap anywhere skips it.
 *
 * - It is in the first HTML, so it covers Home from the very first paint
 *   and its animation runs without waiting for any script.
 * - It plays on a real entry only: after signing in, or opening the app
 *   fresh (not within 6 hours of the last time), never when coming back
 *   from T2QCAL or another page (the same rules as the old welcome).
 * - Reduced motion: a still card for under a second.
 */
export function NewLookWelcome({ serverOpen, data }: { serverOpen: boolean; data: WelcomeData }) {
  // Identical on the server and on hydration: a fresh document has no previous route.
  const [shown, setShown] = useState(() => serverOpen && routeAllowsWelcome(previousPathname()));
  const [leaving, setLeaving] = useState(false);
  const calm = useReducedMotion();

  const finish = useCallback(() => {
    writeWelcomeSeen();
    setShown(false);
  }, []);
  const skip = useCallback(() => setLeaving(true), []);

  // Decide once on arrival; then run the clock.
  useEffect(() => {
    if (!shown) return;
    const play = shouldPlayWelcome({
      previous: previousPathname(),
      lastSeen: readWelcomeSeen(),
      now: Date.now(),
      skipWindowMs: WELCOME_SKIP_WINDOW_MS,
    });
    if (!play) {
      const off = setTimeout(finish, 0);
      return () => clearTimeout(off);
    }
    const timer = setTimeout(skip, calm ? WELCOME_CALM_MS : WELCOME_SHOW_MS);
    return () => clearTimeout(timer);
  }, [shown, calm, finish, skip]);

  // Fading out, then gone. Reduced motion skips the fade.
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(finish, calm ? 0 : FADE_MS);
    return () => clearTimeout(timer);
  }, [leaving, calm, finish]);

  // Any key skips it too.
  useEffect(() => {
    if (!shown) return;
    const onKey = () => skip();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, skip]);

  if (!shown) return null;

  // "Good" "morning," "Challis" — each rises in turn; the name in orange.
  const [first, ...rest] = data.greeting.split(" ");
  const words = data.name
    ? [first, `${rest.join(" ")},`, data.name]
    : [first, `${rest.join(" ")}.`, "Let\u2019s get to work"];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-greeting"
      data-testid="new-look-welcome"
      data-leaving={leaving ? "true" : "false"}
      onClick={skip}
      className={cx(
        "ui-glow fixed inset-0 z-[100] flex h-dvh w-screen flex-col items-center justify-center overflow-hidden bg-ui-bg px-6 text-center",
        leaving && "animate-ui-fade-out motion-reduce:animate-none",
        UI_TEXT,
      )}
    >
      <div className="flex w-full max-w-sm flex-col items-center">
        <Image
          src="/logo-mark.png"
          alt="Tradies2Quote"
          width={220}
          height={104}
          loading="eager"
          fetchPriority="high"
          style={delay(AT.logo)}
          className="h-auto w-52 animate-ui-land motion-reduce:animate-none"
        />

        <div aria-hidden="true" className="relative mt-7 h-11 w-full">
          <span
            style={delay(AT.tape)}
            className="ui-brand-gradient absolute top-0.5 left-0 z-10 h-10 w-10 rounded-ui-md shadow-ui-raised animate-ui-land motion-reduce:animate-none"
          />
          <span
            style={delay(AT.tape + 120)}
            className="ui-tape absolute top-3 right-2 left-8 h-5 origin-left rounded-r-sm animate-ui-unroll motion-reduce:animate-none"
          />
        </div>

        <h1 id="welcome-greeting" className="ui-heading mt-6 text-ui-2xl text-ui-text">
          {words.map((word, i) => (
            <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom">
              <span
                style={delay(AT.word[Math.min(i, AT.word.length - 1)])}
                className={cx(
                  "inline-block animate-ui-rise motion-reduce:animate-none",
                  i === words.length - 1 ? "text-ui-brand-text" : undefined,
                )}
              >
                {word}
              </span>
              {i < words.length - 1 ? <span>&nbsp;</span> : null}
            </span>
          ))}
        </h1>

        <p style={delay(AT.chips)} className="mt-5 flex flex-wrap justify-center gap-2 animate-ui-toast-in motion-reduce:animate-none">
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ui-line bg-ui-surface px-3 text-ui-sm font-semibold text-ui-text">
            <CalendarBlank aria-hidden="true" weight="duotone" className="text-[1.125rem] text-ui-info" />
            {data.today}
          </span>
          <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ui-line bg-ui-surface px-3 text-ui-sm font-semibold text-ui-text">
            <Lightning aria-hidden="true" weight="fill" className="text-[1.125rem] text-ui-hivis" />
            Ready to quote
          </span>
        </p>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          skip();
        }}
        className="ui-focus-ring absolute bottom-[max(env(safe-area-inset-bottom),1.5rem)] min-h-12 rounded-ui-md px-4 text-ui-sm text-ui-muted"
      >
        Tap anywhere to skip
      </button>
    </div>
  );
}
