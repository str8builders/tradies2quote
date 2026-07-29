"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Ruler, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import { calculatorDeepLink } from "@/lib/calculator-app";

/**
 * The T2QCAL showcase card — opens the companion calculator app from inside
 * Tradies2Quote, and tells a tradie who has never heard of it why they'd want
 * to.
 *
 * Every number on the card is counted from T2QCAL's own source (94 calculator
 * slugs across Models/Tools*.swift, 74 documents in Models/Resources.swift,
 * verified by compiling and running tools/AuditSheets.swift) — same standard
 * as /calculator and the landing section. If the app changes, change these
 * together.
 *
 * ## Why a scheme and a timer rather than a link
 *
 * iOS gives no callback for "did that custom scheme open anything". The only
 * signal is indirect: if the app IS installed the system switches away and this
 * page stops being visible, so its `visibilitychange` fires and its timers stop
 * being serviced. If it is NOT installed, nothing happens at all and the timer
 * runs to completion — which is the cue to send them to the App Store instead.
 *
 * The alternative, `canOpenURL`-style detection, does not exist on the web.
 *
 * ## What does NOT travel through this link
 *
 * No token, no session, no client data. A custom URL scheme can be claimed by
 * any app on the device, so anything put in it is effectively public. The two
 * apps share an account through the server — T2QCAL signs into the same GoTrue
 * at api.tradies2quote.com with the same email and password, and reads the
 * same profiles row. The tradie signs into the calculator once and stays
 * signed in. There is nothing a URL needs to carry.
 */

/** Where the App Store sends someone who does not have it yet. */
const APP_STORE_URL = process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL ?? "";

/** Counted from T2QCAL source — see the header comment before editing. */
const STATS = [
  { value: "94", label: "calculators" },
  { value: "74", label: "manuals offline" },
  { value: "1", label: "login, both apps" },
] as const;

type Props = {
  /** Deep destination, e.g. "tool/concrete-slab" or "measure". */
  route?: string;
  /** Show the "see what's inside" link to /calculator. Off inside the App
   * Store shell, where that page redirects back to /app. */
  detailsLink?: boolean;
  className?: string;
};

export default function OpenCalculator({
  route = "",
  detailsLink = false,
  className = "",
}: Props) {
  const [stalled, setStalled] = useState(false);
  const timer = useRef<number | null>(null);

  const launch = useCallback(() => {
    setStalled(false);

    const cleanup = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", cleanup);
    };

    // The app took over: the switch away hides this document. Cancel the
    // fallback so somebody who HAS the app is not also thrown at the store.
    function onHide() {
      if (document.hidden) cleanup();
    }

    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", cleanup);

    window.location.href = calculatorDeepLink(route);

    // 1.2s is long enough that a cold app launch wins the race on an old
    // phone, and short enough that somebody without it is not left looking at
    // a button that did nothing.
    timer.current = window.setTimeout(() => {
      cleanup();
      if (APP_STORE_URL) {
        window.location.href = APP_STORE_URL;
      } else {
        // No store link configured yet — say so rather than failing silently.
        setStalled(true);
      }
    }, 1200);
  }, [route]);

  return (
    <div
      data-testid="dashboard-calculator"
      className={`t2q-card-pro t2q-card-pro-hover p-4 sm:p-5 ${className}`}
    >
      <button
        type="button"
        onClick={launch}
        className="flex w-full items-center gap-4 text-left"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
        >
          <Ruler size={22} weight="bold" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base uppercase tracking-tight sm:text-lg">
            <span className="text-white">T</span>
            <span className="text-brand">2</span>
            <span className="text-white">Q</span>
            <span className="text-hivis">CAL</span>
            <span className="text-white"> — the calculator that quotes.</span>
          </span>
          <span className="mt-0.5 block text-sm text-ink-300">
            Work it out on site — slab, rafters, stairs, camera measuring and
            set-out — and the quantities land back here as a draft quote at
            your markup and GST. Your Tradies2Quote login works there too; no
            second account.
          </span>
        </span>
        <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:inline-flex">
          Open T2QCAL
          <ArrowSquareOut size={12} weight="bold" />
        </span>
        <ArrowSquareOut
          size={18}
          weight="bold"
          className="shrink-0 text-brand sm:hidden"
          aria-hidden="true"
        />
      </button>

      <ul className="mt-3.5 flex flex-wrap gap-2" aria-label="What T2QCAL holds">
        {STATS.map(({ value, label }) => (
          <li
            key={label}
            className="rounded-sm border border-ink-600 bg-ink-900/70 px-2.5 py-1 text-[11px] text-ink-200"
          >
            <span className="font-mono text-brand">{value}</span> {label}
          </li>
        ))}
      </ul>

      {detailsLink && (
        <div className="mt-3 flex justify-end">
          <Link
            href="/calculator"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-brand"
          >
            See everything in it
            <ArrowRight size={12} weight="bold" />
          </Link>
        </div>
      )}

      {stalled && (
        <p className="mt-2 text-[13px] text-hivis">
          T2QCAL doesn&rsquo;t look like it&rsquo;s installed on this phone yet.
        </p>
      )}
    </div>
  );
}
