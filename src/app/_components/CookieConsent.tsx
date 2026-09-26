"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Cookie } from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";

/**
 * Cookie consent banner + analytics gate.
 *
 * The app loads a third-party analytics beacon (`track.js`) that sets a
 * non-essential cookie. Under UK/EU (and increasingly NZ/AU) rules that
 * tracker must NOT run until the visitor has opted in — a passive notice
 * isn't enough. So this component owns two jobs:
 *
 *   1. Show a one-time slim bottom bar with Accept / Decline + a link to
 *      the privacy policy (on the home page only once the visitor scrolls,
 *      so it never covers the hero). The choice is stored in
 *      `localStorage["t2q-cookie-consent"]` ("accepted" | "declined").
 *      Once a choice exists the banner never shows again.
 *   2. Only inject `track.js` once consent is "accepted" (either this
 *      session via Accept, or a prior session read back on mount).
 *      Decline → the script is never loaded.
 *
 * Essential first-party behaviour (Supabase auth cookies, the theme
 * preference, the signup beacon) is unaffected — those are required for
 * the app to function and are covered by the privacy policy.
 *
 * Client component, mounted globally in the root layout. Mirrors the
 * deferred-storage-read + try/catch pattern of FloatingInstallButton so
 * a strict CSP / private-mode localStorage block never throws.
 */

const CONSENT_KEY = "t2q-cookie-consent";
const ANALYTICS_SRC = "https://uptimewatch-vert.vercel.app/track.js";

type Consent = "accepted" | "declined" | null;

/**
 * The iPhone app (Capacitor, whose user agent carries "T2QNativeShell")
 * uses essential cookies only: no banner, and the analytics script never
 * loads there, whatever was chosen before. Decided in the browser, where
 * the banner lives anyway, so the root layout stays static-friendly.
 */
export function analyticsAllowedHere(userAgent: string, nativePlatform: boolean): boolean {
  return !nativePlatform && !userAgent.includes("T2QNativeShell");
}

export function CookieConsent() {
  // `undefined` = not yet read (avoid a flash of the banner before we
  // know the stored choice); null = read, no choice yet → show banner.
  const [consent, setConsent] = useState<Consent | undefined>(undefined);
  // The consent banner belongs on the public/marketing surface, not inside the
  // authenticated app shell (it overlapped the app's own bottom controls). The
  // analytics-injection logic below still runs everywhere for opted-in users.
  const pathname = usePathname() ?? "";
  const onAppPages = pathname.startsWith("/app");
  const onT2qcal = pathname.startsWith("/t2qcal");
  // On the home page the bar waits until the visitor scrolls. It used to sit
  // over the headline and the "Start your free trial" button on every first
  // visit. Nothing non-essential loads before a choice is made, so showing it
  // a moment later changes nothing about consent. Other pages show it at once.
  const onHome = pathname === "/";
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    // Defer the read to a 0-ms timer so it doesn't run synchronously in
    // the effect body (React 19's react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      // In the iPhone app the choice is never read: no banner, no script.
      if (!analyticsAllowedHere(navigator.userAgent, isNativeIOSApp())) return;
      try {
        const stored = window.localStorage.getItem(CONSENT_KEY);
        setConsent(stored === "accepted" || stored === "declined" ? stored : null);
      } catch {
        // private mode / blocked storage — treat as no choice yet.
        setConsent(null);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!onHome || consent !== null || engaged) return;
    const reveal = () => {
      if (window.scrollY > window.innerHeight * 0.5) setEngaged(true);
    };
    window.addEventListener("scroll", reveal, { passive: true });
    // Deferred so a page restored mid-scroll still reveals, without a
    // synchronous setState in the effect body (react-hooks/set-state-in-effect).
    const t = setTimeout(reveal, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("scroll", reveal);
    };
  }, [onHome, consent, engaged]);

  const choose = useCallback((value: "accepted" | "declined") => {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch {
      /* ignore — choice still honoured for this session via state */
    }
    setConsent(value);
  }, []);

  return (
    <>
      {/* Non-essential analytics — loaded only after opt-in. */}
      {consent === "accepted" ? (
        <Script src={ANALYTICS_SRC} strategy="afterInteractive" />
      ) : null}

      {consent === null && !onAppPages && (!onHome || engaged) ? (
        <div
          data-testid="cookie-consent"
          role="dialog"
          aria-label="Cookie consent"
          className="fixed inset-x-0 z-50 border-t border-ink-700 bg-ink-950/[0.97] px-4 pt-3 shadow-[0_-12px_32px_-18px_rgba(0,0,0,0.8)] sm:px-6"
          style={{
            bottom: onT2qcal ? "calc(env(safe-area-inset-bottom, 0px) + 84px)" : 0,
            paddingBottom: onT2qcal ? 12 : "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          }}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <p className="flex flex-1 items-start gap-2.5 text-xs leading-relaxed text-ink-300 sm:text-sm">
              <Cookie size={18} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
              <span>
                Essential cookies keep you signed in to {onT2qcal ? "T2QCAL" : "Tradies2Quote"}.
                With your okay we also run a small analytics script to see
                what&apos;s working.{" "}
                <Link
                  href="/privacy"
                  className="text-brand underline underline-offset-2"
                >
                  Privacy policy
                </Link>
              </span>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => choose("declined")}
                data-testid="cookie-consent-decline"
                className="t2q-btn-ghost-pro min-h-11 flex-1 justify-center px-5 sm:flex-none"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                data-testid="cookie-consent-accept"
                className="t2q-btn-primary-pro min-h-11 flex-1 justify-center px-5 sm:flex-none"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
