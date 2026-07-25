"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  DownloadSimple,
  Check,
  DeviceMobile,
  ShareNetwork,
} from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";

const emptySubscribe = () => () => {};

/**
 * "Install app" button. Two surfaces:
 *   - On Android / desktop Chrome / Edge: catches `beforeinstallprompt`
 *     and triggers the native install flow when clicked.
 *   - On iOS Safari (no `beforeinstallprompt` API): opens a small modal
 *     with Add-to-Home-Screen instructions.
 *
 * Hides itself once the app is installed (display-mode standalone).
 *
 * Ported from `landing-export/components/InstallPWAButton.jsx`. Lucide
 * icons swapped for Phosphor.
 */

type Props = {
  /**
   * - "hero":  full-width primary CTA used in the landing hero row
   * - "nav":   medium ghost-style button with text + icon (legacy)
   * - "icon":  Wave 36 — compact 40x40 square that only shows the
   *            download icon. Designed to sit next to the mobile
   *            hamburger menu in the landing header. Still opens
   *            the same iOS/Android instructions modal on click.
   */
  variant?: "nav" | "hero" | "icon";
  className?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type LegacyNavigator = Navigator & { standalone?: boolean };
type GlobalWithMSStream = Window & { MSStream?: unknown };

export default function InstallPWAButton({
  variant = "nav",
  className = "",
}: Props) {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  // Inside the iOS App Store shell the app IS installed — a PWA
  // install button there is nonsense and a guaranteed review flag.
  // (useSyncExternalStore split keeps SSR + browser hydration aligned;
  // the Capacitor bridge exists before hydration, so no flash.)
  const nativeShell = useSyncExternalStore(
    emptySubscribe,
    isNativeIOSApp,
    () => false,
  );
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [platform, setPlatform] = useState<"desktop" | "ios" | "android">(
    "desktop",
  );

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const win = window as GlobalWithMSStream;
    const nav = navigator as LegacyNavigator;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !win.MSStream;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      nav.standalone === true;

    function onBefore(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);

    // Initial platform / installed state go through a 0-ms timer so the
    // setState calls live inside a subscribed callback (React 19
    // `react-hooks/set-state-in-effect`).
    const t = setTimeout(() => {
      setPlatform(
        isIos ? "ios" : /Android/i.test(ua) ? "android" : "desktop",
      );
      if (isStandalone) setInstalled(true);
    }, 0);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function handleClick() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === "accepted") setInstalled(true);
      } catch {
        /* ignore */
      }
      setDeferredPrompt(null);
      return;
    }
    // iOS or any browser without beforeinstallprompt — open instructions
    setShowIosHelp(true);
  }

  if (nativeShell) return null;
  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        data-testid="install-pwa-button"
        aria-label="Install app on phone"
        title="Install app on phone"
        className={
          variant === "hero"
            ? `t2q-btn-primary ${className}`
            : variant === "icon"
              ? `t2q-install-pulse inline-flex h-10 items-center gap-1.5 rounded-sm border-2 border-brand bg-brand px-3 font-display text-xs uppercase tracking-tight text-ink-900 transition-colors hover:bg-hivis hover:border-hivis ${className}`
              : `inline-flex items-center gap-2 h-10 px-4 border-2 border-ink-600 hover:border-brand text-white font-mono text-xs uppercase tracking-[0.2em] transition-colors rounded-sm ${className}`
        }
      >
        {variant === "hero" ? (
          <>
            <DownloadSimple size={20} weight="bold" />
            <span>Install on phone</span>
          </>
        ) : variant === "icon" ? (
          <>
            <DownloadSimple size={16} weight="bold" />
            <span>Install</span>
          </>
        ) : (
          <>
            <DeviceMobile size={16} weight="bold" className="text-brand" />
            <span>Install app</span>
          </>
        )}
      </button>
      {showIosHelp && (
        <IosHelp platform={platform} onClose={() => setShowIosHelp(false)} />
      )}
    </>
  );
}

function IosHelp({
  platform,
  onClose,
}: {
  platform: "desktop" | "ios" | "android";
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur grid place-items-end sm:place-items-center p-4"
      data-testid="install-pwa-modal"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="t2q-card max-w-md w-full p-6 sm:p-8 relative"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand mb-2">
          {"// add to home screen"}
        </div>
        <h3 className="font-display text-2xl sm:text-3xl uppercase tracking-tight mb-3">
          Get tradies2Quote on your{" "}
          <span className="text-brand">phone.</span>
        </h3>
        {platform === "ios" ? (
          <ol className="space-y-3 text-sm text-ink-200">
            <Step n={1}>
              Tap the{" "}
              <ShareNetwork
                size={14}
                weight="bold"
                className="inline -mt-0.5 mr-0.5"
              />
              <strong className="text-white">Share</strong> button in
              Safari&apos;s bottom toolbar.
            </Step>
            <Step n={2}>
              Scroll down and tap{" "}
              <strong className="text-white">
                &ldquo;Add to Home Screen&rdquo;
              </strong>
              .
            </Step>
            <Step n={3}>
              Tap <strong className="text-white">&ldquo;Add&rdquo;</strong> —
              done. Tap the orange icon any time you want to quote.
            </Step>
          </ol>
        ) : (
          <ol className="space-y-3 text-sm text-ink-200">
            <Step n={1}>
              Open this site in <strong className="text-white">Chrome</strong>{" "}
              or <strong className="text-white">Edge</strong> on your phone.
            </Step>
            <Step n={2}>
              Tap the <strong className="text-white">⋮ menu</strong> →{" "}
              <strong className="text-white">
                &ldquo;Install app&rdquo;
              </strong>{" "}
              or{" "}
              <strong className="text-white">
                &ldquo;Add to Home Screen&rdquo;
              </strong>
              .
            </Step>
            <Step n={3}>
              Tap <strong className="text-white">Install</strong>. Done — opens
              like a real app.
            </Step>
          </ol>
        )}
        <div className="mt-6 flex items-center justify-between">
          <a
            href="/install"
            data-testid="install-pwa-fullguide"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:underline"
          >
            {"// full step-by-step guide →"}
          </a>
          <button
            onClick={onClose}
            className="t2q-btn-ghost h-10 px-4 text-sm"
            data-testid="install-pwa-close"
          >
            <Check size={16} weight="bold" /> Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 w-7 h-7 grid place-items-center bg-brand text-ink-900 font-display text-sm">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
