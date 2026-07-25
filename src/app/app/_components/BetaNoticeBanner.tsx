"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, X } from "@phosphor-icons/react/dist/ssr";

/**
 * Lightweight, dismissible beta safety reminder.
 *
 * Shows once per browser session on the first /app load, then stays
 * dismissed for the rest of the session (sessionStorage — no DB, no server
 * flag). Mounted in the /app layout, which persists across client
 * navigation, so it does NOT re-pop on every route change. Versioned key so
 * a meaningful beta update can re-surface it later.
 *
 * Renders nothing on the server / first client paint (visible starts false),
 * then the effect decides — so there's no hydration mismatch and no flash
 * for users who already dismissed it.
 */
const STORAGE_KEY = "t2q-beta-notice-dismissed-v1";
/** Auto-dismiss after this long on screen, then fade out. */
const AUTO_HIDE_MS = 10000;
const FADE_MS = 350;

export function BetaNoticeBanner() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Decide visibility after mount (deferred via setTimeout, mirroring
  // AppSplash) so we never set state directly in the effect body and there's
  // no hydration mismatch — server + first client paint render nothing.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (sessionStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
      } catch {
        // sessionStorage unavailable (private mode etc.) — show it; it just
        // won't persist dismissal, the safe default for a reminder.
        setVisible(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Once shown, auto-dismiss after 10s — fade it out then unmount, and
  // mark it seen so it doesn't re-pop this session.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(beginExit, AUTO_HIDE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function persistDismissed() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore — nothing to persist to */
    }
  }

  // Fade out, then unmount after the transition.
  function beginExit() {
    persistDismissed();
    setLeaving(true);
    setTimeout(() => setVisible(false), FADE_MS);
  }

  if (!visible) return null;

  return (
    <div
      data-testid="beta-review-notice"
      className={`overflow-hidden border-b border-white/[0.06] bg-ink-950/92 px-4 py-2.5 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur transition-all duration-300 ease-out sm:px-6 ${
        leaving
          ? "max-h-0 -translate-y-1 border-transparent py-0 opacity-0"
          : "max-h-40 translate-y-0 opacity-100"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
        >
          <ShieldCheck size={18} weight="bold" />
        </span>
        <p className="min-w-0 flex-1 text-sm leading-snug text-ink-200">
          {/* "Beta" labelling invites an App Review 2.1 rejection
              (betas/demos don't belong on the App Store) — neutral chip. */}
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-brand">
            Heads up
          </span>{" "}
          <span className="text-ink-300">
            Treat T2Q scopes, quantities &amp; prices as drafts — review each
            quote before you send it.
          </span>
        </p>
        <Link
          href="/app/beta"
          data-testid="beta-review-link"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-200 transition-colors hover:border-brand/40 hover:text-brand sm:inline-flex"
        >
          How T2Q quotes
          <ArrowRight size={12} weight="bold" />
        </Link>
        <button
          type="button"
          onClick={beginExit}
          aria-label="Dismiss reminder"
          data-testid="beta-review-dismiss"
          className="shrink-0 rounded-lg p-2 text-ink-400 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
