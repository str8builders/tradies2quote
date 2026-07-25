"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { isNativeIOSApp } from "@/lib/native-app";
import {
  X,
  DeviceMobile,
  DownloadSimple,
  Clock,
  ShareNetwork,
} from "@phosphor-icons/react";

/**
 * Smart, low-friction install nudge for first-visit mobile users.
 *
 * Behaviour:
 *  - Only shows on iOS or Android, never desktop
 *  - Never shows when already installed (display-mode standalone)
 *  - Pops up ~7s after first visit so the user gets the value first
 *  - Two dismiss options:
 *      → "Maybe later"   = silent for 7 days
 *      → close X         = silent for 30 days
 *  - Resets if the user actively installs (`appinstalled` event)
 *
 * Ported from `landing-export/components/InstallNudge.jsx`. Lucide icons
 * swapped for Phosphor to match the rest of the app.
 */

const STORAGE_KEY = "t2q-install-nudge";

type SnoozeState = { snoozeUntil?: number; installed?: boolean };
type ViewMode = false | true | "ios-help";

function loadState(): SnoozeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SnoozeState) : null;
  } catch {
    return null;
  }
}
function saveState(state: SnoozeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type LegacyNavigator = Navigator & { standalone?: boolean };
type GlobalWithMSStream = Window & { MSStream?: unknown };

export default function InstallNudge() {
  const [open, setOpen] = useState<ViewMode>(false);
  const [platform, setPlatform] = useState<"desktop" | "ios" | "android">(
    "desktop",
  );
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const win = window as GlobalWithMSStream;
    const nav = navigator as LegacyNavigator;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !win.MSStream;
    const isAndroid = /Android/i.test(ua);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      nav.standalone === true;

    // Inside the iOS App Store shell the app IS installed — never nudge.
    if (isNativeIOSApp()) return;
    if (isStandalone) return;
    if (!isIos && !isAndroid) return;

    const state = loadState() ?? {};
    if (state.installed) return;
    if (state.snoozeUntil && Date.now() < Number(state.snoozeUntil)) return;

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      saveState({ installed: true });
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);

    // Initial platform set + nudge open both go through subscribed
    // callbacks so React 19's `react-hooks/set-state-in-effect` rule
    // is happy.
    const platformTimer = setTimeout(
      () => setPlatform(isIos ? "ios" : "android"),
      0,
    );
    const t = setTimeout(() => setOpen(true), 7000);

    return () => {
      clearTimeout(platformTimer);
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function snooze(days: number) {
    saveState({ snoozeUntil: Date.now() + days * 24 * 60 * 60 * 1000 });
    setOpen(false);
  }

  async function installNow() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") {
          saveState({ installed: true });
        } else {
          snooze(7);
        }
      } catch {
        snooze(7);
      }
      setDeferredPrompt(null);
      setOpen(false);
      return;
    }
    setOpen("ios-help");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nudge"
          initial={{ y: 240, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 280, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 30 }}
          className="fixed left-3 right-3 bottom-3 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[80]"
          data-testid="install-nudge"
        >
          <div className="t2q-card bg-ink-950/95 backdrop-blur-xl border border-brand/40 shadow-[0_18px_60px_rgba(0,0,0,0.55),0_0_30px_rgba(255,95,21,0.18)] overflow-hidden relative">
            <div className="h-1.5 bg-hivis" />

            <button
              onClick={() => snooze(30)}
              aria-label="Close"
              data-testid="install-nudge-close"
              className="absolute top-3 right-3 p-1 text-ink-500 hover:text-white"
            >
              <X size={16} weight="bold" />
            </button>

            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <div className="shrink-0 w-12 h-12 rounded-sm bg-brand text-ink-900 grid place-items-center">
                  <DeviceMobile size={24} weight="bold" />
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-brand mb-1">
                    {"// ON-SITE READY"}
                  </div>
                  <h3 className="font-display text-xl sm:text-2xl uppercase tracking-tight leading-tight">
                    Put quoting on your{" "}
                    <span className="text-brand">home screen.</span>
                  </h3>
                  <p className="text-ink-300 text-sm mt-1.5 leading-relaxed">
                    {platform === "ios"
                      ? "Open it like a real app. Works offline. Two taps to install — we'll show you."
                      : "Install in 5 seconds. Opens fullscreen, works offline, no app store."}
                  </p>
                </div>
              </div>

              {open === "ios-help" ? (
                <IosSteps />
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => snooze(7)}
                    className="t2q-btn-ghost h-12 text-sm"
                    data-testid="install-nudge-later"
                  >
                    <Clock size={16} weight="bold" /> Maybe later
                  </button>
                  <button
                    onClick={installNow}
                    className="t2q-btn-primary h-12 text-sm"
                    data-testid="install-nudge-install"
                  >
                    <DownloadSimple size={16} weight="bold" /> Install
                  </button>
                </div>
              )}

              {open === "ios-help" && (
                <>
                  <a
                    href="/install"
                    data-testid="install-nudge-fullguide"
                    className="mt-3 block text-center font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:underline"
                  >
                    {"// full step-by-step guide →"}
                  </a>
                  <button
                    onClick={() => snooze(7)}
                    className="mt-3 w-full t2q-btn-ghost h-11 text-sm"
                    data-testid="install-nudge-ios-done"
                  >
                    Got it
                  </button>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IosSteps() {
  return (
    <ol
      className="mt-5 space-y-2.5 text-sm text-ink-200"
      data-testid="install-nudge-ios-steps"
    >
      <Step n={1}>
        Tap{" "}
        <ShareNetwork
          size={14}
          weight="bold"
          className="inline -mt-0.5 mr-0.5"
        />
        <strong className="text-white">Share</strong> at the bottom of Safari
      </Step>
      <Step n={2}>
        Scroll down → tap{" "}
        <strong className="text-white">&ldquo;Add to Home Screen&rdquo;</strong>
      </Step>
      <Step n={3}>
        Tap <strong className="text-white">&ldquo;Add&rdquo;</strong> —
        you&apos;re done
      </Step>
    </ol>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 items-start">
      <span className="shrink-0 w-6 h-6 grid place-items-center bg-brand text-ink-900 font-display text-xs">
        {n}
      </span>
      <span className="leading-relaxed pt-0.5">{children}</span>
    </li>
  );
}
