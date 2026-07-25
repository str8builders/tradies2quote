"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { DownloadSimple, X } from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";
import {
  isIOSUserAgent,
  isStandalone,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-helpers";

/**
 * Wave 12.3 — floating Install-App CTA.
 *
 * Replaces the top-bar Install button that used to sit inside
 * AppHeader + landing Header. The tradie-feedback was: the old button
 * was buried in the top strip; on mobile it competed with the logo
 * and mobile navigation. Moving it to a fixed bottom-right floating action
 * pill keeps it visible-but-out-of-the-way at all times.
 *
 * Behaviour matrix (same as the old InstallAppButton):
 *   - Already installed (standalone display-mode)        → renders nothing
 *   - Chromium that fires `beforeinstallprompt`           → click fires the
 *                                                          native install
 *                                                          prompt
 *   - iOS Safari (no beforeinstallprompt)                 → click opens a
 *                                                          3-step "Add to
 *                                                          Home Screen"
 *                                                          tooltip
 *   - Anything else (Firefox desktop, older Safari)       → renders nothing
 *
 * Pinned bottom-right. On mobile it sits above the bottom nav. On desktop
 * the pill sits at `bottom: 24px`.
 *
 * Highlighted state: brand-orange fill with hi-vis yellow ring + a
 * slow pulsing shadow so it reads as "tap me" without being noisy.
 * Drops to a quieter colour once the user has dismissed it once
 * (sessionStorage), but stays visible — the user can install at any
 * time, the agent just stops shouting after the first dismissal.
 */

const DISMISS_KEY = "t2q-install-dismissed";

type State =
  | { mode: "hidden" }
  | { mode: "prompt"; promptEvent: BeforeInstallPromptEvent }
  | { mode: "ios" };

export function FloatingInstallButton() {
  // Wave 36 — restrict to /app/* only. The pill should ONLY appear for
  // signed-in tradies inside the product. Specifically NOT on:
  //   - "/" — marketing landing (InstallNudge handles that)
  //   - /quote/[token] — the client-facing public quote view (the
  //     tradie's CUSTOMER is the visitor here; offering them to install
  //     the tradie's quoting app is wrong and looked like spam over the
  //     quote total in the screenshot)
  //   - /login, /signup, /forgot-password, /reset-password — auth pages
  //     (we want focus on the form, not an install pill)
  //   - /privacy, /terms, /support — legal pages
  //   - /auth/callback — transient OAuth handoff
  // Inverting the condition is safer than maintaining a deny-list: any
  // new public route added later automatically inherits the right
  // behaviour (no install pill until they sign in and enter the app).
  const pathname = usePathname();
  const isInsideApp = pathname?.startsWith("/app") ?? false;

  const [state, setState] = useState<State>({ mode: "hidden" });
  const [showIOSSheet, setShowIOSSheet] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Inside the iOS App Store shell the app IS installed — never offer.
    if (isNativeIOSApp()) return;
    // Already installed — bail entirely.
    if (isStandalone(window)) return;

    // iOS Safari doesn't fire `beforeinstallprompt` at all.
    const isIOS = isIOSUserAgent(
      navigator.userAgent ?? "",
      navigator.maxTouchPoints ?? 0,
    );

    // Defer the initial state reads to a 0-ms timer so they don't run
    // synchronously inside the effect body (React 19's
    // react-hooks/set-state-in-effect).
    const t = setTimeout(() => {
      try {
        setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        /* private mode */
      }
      if (isIOS) setState({ mode: "ios" });
    }, 0);

    // iOS Safari never fires `beforeinstallprompt` — no listeners needed.
    if (isIOS) return () => clearTimeout(t);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setState({
        mode: "prompt",
        promptEvent: e as BeforeInstallPromptEvent,
      });
    }
    function onInstalled() {
      setState({ mode: "hidden" });
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const onClick = useCallback(async () => {
    if (state.mode === "prompt") {
      try {
        await state.promptEvent.prompt();
        const choice = await state.promptEvent.userChoice;
        if (choice.outcome === "accepted") {
          setState({ mode: "hidden" });
        }
      } catch {
        /* user cancelled */
      }
    } else if (state.mode === "ios") {
      setShowIOSSheet(true);
    }
  }, [state]);

  const onDismiss = useCallback(() => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  if (state.mode === "hidden") return null;
  if (!isInsideApp) return null;

  return (
    <>
      <div
        data-testid="floating-install-button"
        data-state={state.mode}
        data-dismissed={dismissed}
        className="fixed right-4 z-40 flex items-center gap-2 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] sm:right-6 sm:bottom-6 sm:hidden"
      >
        <button
          type="button"
          onClick={onClick}
          data-testid="floating-install-trigger"
          aria-label="Install Tradies2Quote on your phone"
          className={
            dismissed
              ? "inline-flex h-12 items-center gap-2 rounded-full border border-ink-600 bg-ink-900 px-4 font-display text-xs uppercase tracking-tight text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] hover:border-brand hover:text-brand transition-colors sm:h-12 sm:px-5 sm:text-sm"
              : "t2q-install-pulse inline-flex h-12 items-center gap-2 rounded-full border-2 border-hivis bg-brand px-4 font-display text-xs uppercase tracking-tight text-ink-900 shadow-[0_10px_30px_-8px_rgba(255,95,21,0.6)] hover:brightness-110 sm:h-12 sm:px-5 sm:text-sm"
          }
        >
          <DownloadSimple size={16} weight="bold" />
          Install app
        </button>
        {!dismissed ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss install prompt"
            data-testid="floating-install-dismiss"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink-600 bg-ink-900/85 text-ink-300 backdrop-blur hover:border-brand hover:text-brand"
          >
            <X size={12} weight="bold" />
          </button>
        ) : null}
      </div>

      {/* iOS Add-to-Home-Screen tooltip (3-step). Native iOS Safari
          doesn't expose `beforeinstallprompt` so this is the only way
          to install. */}
      {showIOSSheet ? (
        <div
          data-testid="floating-install-ios-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={() => setShowIOSSheet(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-t-2xl border border-ink-700 bg-ink-950 p-6 text-white sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg uppercase tracking-tight">
                Install on iPhone
              </h3>
              <button
                type="button"
                onClick={() => setShowIOSSheet(false)}
                aria-label="Close"
                className="text-ink-400 hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </div>
            <ol className="mt-4 space-y-3 text-sm text-ink-200">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand bg-brand text-ink-900 font-display text-xs">
                  1
                </span>
                Tap the <strong className="text-white">Share</strong> button
                in Safari (the square with the up-arrow).
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand bg-brand text-ink-900 font-display text-xs">
                  2
                </span>
                Scroll down and tap{" "}
                <strong className="text-white">Add to Home Screen</strong>.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-brand bg-brand text-ink-900 font-display text-xs">
                  3
                </span>
                Tap <strong className="text-white">Add</strong>. The T2Q
                icon will appear on your home screen.
              </li>
            </ol>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
              {"// installs as a real app — no app store, no account"}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
