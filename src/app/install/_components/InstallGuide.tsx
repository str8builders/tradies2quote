"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Export,
  PlusSquare,
  DotsThreeOutlineVertical,
  DownloadSimple,
  CheckCircle,
  WifiHigh,
  Lightning,
  House,
  WarningCircle,
  ArrowSquareOut,
  AppleLogo,
  AndroidLogo,
} from "@phosphor-icons/react";
import {
  isIOSUserAgent,
  isStandalone,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa-helpers";

/**
 * The /install tutorial — a professional, platform-aware walkthrough for
 * adding Tradies2Quote to a phone's home screen.
 *
 * Design goals:
 *  - Works with NO JavaScript: both the iPhone and Android step cards are
 *    server-rendered, so even a crawler / JS-off visitor sees the full
 *    instructions. JS only *enhances* (reorders to the detected device,
 *    enables the one-tap Android install button, shows installed/in-app
 *    states). That also means zero hydration mismatch.
 *  - Catches the #1 real-world failure: visitors who open the link inside
 *    an in-app browser (Instagram / Facebook / TikTok / LinkedIn) where
 *    PWA install is impossible — we tell them to open in Safari/Chrome.
 *  - Brand + theme aware: uses the shared design tokens so it adapts to
 *    the light/dark theme and inherits the contrast fixes.
 */

type Platform = "ios" | "android" | "desktop";

/** Detect common in-app browser webviews where install is blocked. */
function detectInApp(ua: string): string | null {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) return "TikTok";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/Pinterest/i.test(ua)) return "Pinterest";
  if (/Line\//i.test(ua)) return "LINE";
  if (/MicroMessenger/i.test(ua)) return "WeChat";
  // Generic Android WebView (no real browser chrome) — best-effort.
  if (/; wv\)/i.test(ua)) return "an in-app browser";
  return null;
}

export function InstallGuide() {
  const [hydrated, setHydrated] = useState(false);
  const [platform, setPlatform] = useState<Platform>("ios");
  const [inApp, setInApp] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const ios = isIOSUserAgent(ua, navigator.maxTouchPoints);
    const android = /Android/i.test(ua);
    const resolved: Platform = ios ? "ios" : android ? "android" : "desktop";

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);

    // Defer state writes out of the effect body (React 19 lint rule).
    const t = setTimeout(() => {
      setPlatform(resolved);
      setInApp(detectInApp(ua));
      setInstalled(isStandalone(window));
      setHydrated(true);
    }, 0);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const installAndroid = useCallback(async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
    } catch {
      /* ignore */
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  // ── Already installed ──────────────────────────────────────────────
  if (hydrated && installed) {
    return (
      <div
        data-testid="install-already"
        className="t2q-card border border-emerald-500/40 p-7 text-center sm:p-9"
      >
        <CheckCircle
          size={48}
          weight="fill"
          className="mx-auto text-emerald-500"
        />
        <h2 className="mt-4 font-display text-2xl uppercase tracking-tight sm:text-3xl">
          You&apos;re all set.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-ink-300">
          Tradies2Quote is already on this device. Open it from your home
          screen — the orange icon — any time you need to quote.
        </p>
        <a href="/app" className="t2q-btn-primary mt-5 inline-flex h-12">
          Open the app
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* In-app browser warning — shown first when detected */}
      {hydrated && inApp ? <InAppWarning app={inApp} platform={platform} /> : null}

      {/* Android one-tap install (only when the browser offers it) */}
      {hydrated && deferredPrompt && !inApp ? (
        <div
          data-testid="install-oneclick"
          className="t2q-card border border-brand/40 p-6 text-center"
        >
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
            {"// one tap"}
          </p>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-tight">
            Install in one tap.
          </h2>
          <p className="mt-1.5 text-sm text-ink-300">
            Your browser can add it straight to your home screen.
          </p>
          <button
            type="button"
            onClick={installAndroid}
            data-testid="install-oneclick-btn"
            className="t2q-btn-primary mt-4 inline-flex h-12"
          >
            <DownloadSimple size={20} weight="bold" />
            Install Tradies2Quote
          </button>
        </div>
      ) : null}

      {/* Platform step cards. Both render server-side; after hydration the
          detected one is ordered first and badged. */}
      <div className="grid gap-6">
        <IosCard primary={hydrated && platform === "ios"} order={platform === "ios" ? 0 : 1} />
        <AndroidCard
          primary={hydrated && platform === "android"}
          order={platform === "android" ? 0 : 1}
          hasNativePrompt={Boolean(deferredPrompt)}
        />
      </div>

      <WhatYouGet />
    </div>
  );
}

function InAppWarning({ app, platform }: { app: string; platform: Platform }) {
  return (
    <div
      data-testid="install-inapp-warning"
      className="t2q-card border border-amber-500/50 bg-amber-500/5 p-6"
    >
      <div className="flex items-start gap-3">
        <WarningCircle
          size={26}
          weight="fill"
          className="shrink-0 text-amber-500"
        />
        <div>
          <h2 className="font-display text-xl uppercase tracking-tight">
            Open in your browser first.
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-300">
            You opened this inside {app}. {app}&apos;s built-in browser
            can&apos;t install apps. Open this page in{" "}
            <strong className="text-white">
              {platform === "ios" ? "Safari" : "Chrome"}
            </strong>{" "}
            and it&apos;ll only take a few taps.
          </p>
          <ol className="mt-4 space-y-2 text-sm text-ink-200">
            <li className="flex gap-3">
              <Num n={1} />
              <span className="pt-0.5">
                Tap the{" "}
                <DotsThreeOutlineVertical
                  size={15}
                  weight="fill"
                  className="-mt-0.5 inline"
                />{" "}
                menu (usually top-right).
              </span>
            </li>
            <li className="flex gap-3">
              <Num n={2} />
              <span className="pt-0.5">
                Choose{" "}
                <strong className="text-white">
                  &ldquo;Open in {platform === "ios" ? "Safari" : "Chrome"}&rdquo;
                </strong>{" "}
                <ArrowSquareOut size={14} weight="bold" className="-mt-0.5 inline" />
              </span>
            </li>
            <li className="flex gap-3">
              <Num n={3} />
              <span className="pt-0.5">
                Then follow the steps below.
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

function IosCard({ primary, order }: { primary: boolean; order: number }) {
  return (
    <section
      data-testid="install-card-ios"
      style={{ order }}
      className={`t2q-card p-6 sm:p-7 ${primary ? "border-2 border-brand" : "border border-ink-600"}`}
    >
      <CardHead
        icon={<AppleLogo size={22} weight="fill" />}
        label="iPhone & iPad"
        sub="Safari"
        primary={primary}
      />
      <ol className="mt-5 space-y-4">
        <StepRow n={1}>
          <span>
            Tap the{" "}
            <span className="mx-1 inline-flex h-7 w-7 -translate-y-0.5 items-center justify-center rounded-md border border-ink-500 bg-ink-800 align-middle text-white">
              <Export size={16} weight="bold" />
            </span>{" "}
            <strong className="text-white">Share</strong> button at the bottom of
            Safari.
          </span>
        </StepRow>
        <StepRow n={2}>
          <span>
            Scroll down and tap{" "}
            <strong className="text-white">Add to Home Screen</strong>.
          </span>
          {/* Mock of the iOS share-sheet row */}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-600 bg-ink-800 px-4 py-3">
            <span className="text-sm text-white">Add to Home Screen</span>
            <PlusSquare size={20} weight="regular" className="text-ink-200" />
          </div>
        </StepRow>
        <StepRow n={3}>
          <span>
            Tap <strong className="text-white">Add</strong> (top-right). The
            orange icon lands on your home screen — done.
          </span>
        </StepRow>
      </ol>
    </section>
  );
}

function AndroidCard({
  primary,
  order,
  hasNativePrompt,
}: {
  primary: boolean;
  order: number;
  hasNativePrompt: boolean;
}) {
  return (
    <section
      data-testid="install-card-android"
      style={{ order }}
      className={`t2q-card p-6 sm:p-7 ${primary ? "border-2 border-brand" : "border border-ink-600"}`}
    >
      <CardHead
        icon={<AndroidLogo size={22} weight="fill" />}
        label="Android"
        sub="Chrome"
        primary={primary}
      />
      {hasNativePrompt ? (
        <p className="mt-4 rounded-lg border border-brand/30 bg-brand/5 px-4 py-3 text-sm text-ink-200">
          Use the orange{" "}
          <strong className="text-white">Install Tradies2Quote</strong> button
          above — one tap and you&apos;re done.
        </p>
      ) : null}
      <ol className="mt-5 space-y-4">
        <StepRow n={1}>
          <span>
            Tap the{" "}
            <span className="mx-1 inline-flex h-7 w-7 -translate-y-0.5 items-center justify-center rounded-md border border-ink-500 bg-ink-800 align-middle text-white">
              <DotsThreeOutlineVertical size={15} weight="fill" />
            </span>{" "}
            <strong className="text-white">menu</strong> (top-right in Chrome).
          </span>
        </StepRow>
        <StepRow n={2}>
          <span>
            Tap{" "}
            <strong className="text-white">Install app</strong> (or{" "}
            <strong className="text-white">Add to Home screen</strong>).
          </span>
          <div className="mt-3 flex items-center justify-between rounded-lg border border-ink-600 bg-ink-800 px-4 py-3">
            <span className="text-sm text-white">Install app</span>
            <DownloadSimple size={18} weight="bold" className="text-ink-200" />
          </div>
        </StepRow>
        <StepRow n={3}>
          <span>
            Tap <strong className="text-white">Install</strong> — it opens
            fullscreen like a real app.
          </span>
        </StepRow>
      </ol>
    </section>
  );
}

function WhatYouGet() {
  const items: { icon: ReactNode; title: string; body: string }[] = [
    {
      icon: <House size={20} weight="bold" />,
      title: "One tap from home",
      body: "Quote from the driveway — no typing a web address.",
    },
    {
      icon: <Lightning size={20} weight="bold" />,
      title: "Opens fullscreen",
      body: "No browser bars. Feels like a proper app.",
    },
    {
      icon: <WifiHigh size={20} weight="bold" />,
      title: "One-tap access",
      body: "Right there on your home screen — no browser, no login hunt.",
    },
  ];
  return (
    <section className="t2q-card border border-ink-600 p-6 sm:p-7">
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
        {"// why install"}
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="flex gap-3 sm:flex-col sm:gap-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-brand/30 bg-brand/10 text-brand">
              {it.icon}
            </span>
            <div>
              <p className="font-display text-base uppercase tracking-tight">
                {it.title}
              </p>
              <p className="mt-0.5 text-sm text-ink-300">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CardHead({
  icon,
  label,
  sub,
  primary,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  primary: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-lg border border-ink-600 bg-ink-800 text-white">
        {icon}
      </span>
      <div className="flex-1">
        <h2 className="font-display text-xl uppercase tracking-tight">
          {label}
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
          {sub}
        </p>
      </div>
      {primary ? (
        <span className="inline-flex items-center rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.15em] text-brand">
          Your device
        </span>
      ) : null}
    </div>
  );
}

function StepRow({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <Num n={n} />
      <div className="flex-1 pt-0.5 text-sm leading-relaxed text-ink-200">
        {children}
      </div>
    </li>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand font-display text-sm text-ink-900">
      {n}
    </span>
  );
}
