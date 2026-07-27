"use client";

import { useCallback, useRef, useState } from "react";
import { Ruler, ArrowSquareOut } from "@phosphor-icons/react";
import { calculatorDeepLink } from "@/lib/calculator-app";

/**
 * Opens T2QCAL, the companion calculator app, from inside Tradies2Quote.
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
 * apps share an account through the server; the tradie signs into the
 * calculator once and stays signed in. There is nothing a URL needs to carry.
 */

/** Where the App Store sends someone who does not have it yet. */
const APP_STORE_URL = process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL ?? "";

type Props = {
  /** Deep destination, e.g. "tool/concrete-slab" or "measure". */
  route?: string;
  className?: string;
};

export default function OpenCalculator({ route = "", className = "" }: Props) {
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
    <div className={className}>
      <button
        type="button"
        onClick={launch}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-800/60 p-4 text-left transition hover:border-brand/40 hover:bg-ink-800"
      >
        <Ruler size={22} weight="fill" className="shrink-0 text-brand" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-white">
            Open T2QCAL
          </span>
          <span className="block text-[13px] text-ink-300">
            94 calculators, camera measuring and set-out — quantities come back
            here as a draft quote.
          </span>
        </span>
        <ArrowSquareOut size={18} className="shrink-0 text-ink-400" aria-hidden />
      </button>

      {stalled && (
        <p className="mt-2 text-[13px] text-hivis">
          T2QCAL doesn&rsquo;t look like it&rsquo;s installed on this phone yet.
        </p>
      )}
    </div>
  );
}
