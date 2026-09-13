"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { Cookie } from "@phosphor-icons/react";

/**
 * Cookie consent banner + analytics gate.
 *
 * The app loads a third-party analytics beacon (`track.js`) that sets a
 * non-essential cookie. Under UK/EU (and increasingly NZ/AU) rules that
 * tracker must NOT run until the visitor has opted in — a passive notice
 * isn't enough. So this component owns two jobs:
 *
 *   1. Show a one-time bottom banner with Accept / Decline + a link to
 *      the privacy policy. The choice is stored in
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

export function CookieConsent() {
  // `undefined` = not yet read (avoid a flash of the banner before we
  // know the stored choice); null = read, no choice yet → show banner.
  const [consent, setConsent] = useState<Consent | undefined>(undefined);
  // The consent banner belongs on the public/marketing surface, not inside the
  // authenticated app shell (it overlapped the app's own bottom controls). The
  // analytics-injection logic below still runs everywhere for opted-in users.
  const pathname = usePathname();
  const inApp = pathname?.startsWith("/app") ?? false;

  useEffect(() => {
    // Defer the read to a 0-ms timer so it doesn't run synchronously in
    // the effect body (React 19's react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
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

      {consent === null && !inApp ? (
        <div
          data-testid="cookie-consent"
          role="dialog"
          aria-label="Cookie consent"
          className="fixed bottom-[88px] left-4 right-4 z-50 sm:bottom-6 sm:left-6 sm:right-auto sm:max-w-md"
          style={pathname?.startsWith("/t2qcal") ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" } : undefined}
        >
          <div className="t2q-card-pro flex flex-col gap-3 p-4 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)] sm:p-5">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
              >
                <Cookie size={18} weight="bold" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm uppercase tracking-tight text-white">
                  Cookies on {pathname.startsWith("/t2qcal") ? "T2QCAL" : "Tradies2Quote"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-300 sm:text-sm">
                  We use essential cookies to keep you signed in. With your
                  okay we also load a small analytics script to see what&apos;s
                  working. See our{" "}
                  <Link
                    href="/privacy"
                    className="text-brand underline-offset-2 hover:underline"
                  >
                    privacy policy
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => choose("declined")}
                data-testid="cookie-consent-decline"
                className="t2q-btn-ghost-pro flex-1 justify-center"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => choose("accepted")}
                data-testid="cookie-consent-accept"
                className="t2q-btn-primary-pro flex-1 justify-center"
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
