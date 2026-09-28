"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { T2QCAL_LAUNCH_WAIT_MS, calculatorDeepLink, type T2QCALRoute } from "@/lib/calculator-app";
import { isNativeIOSApp } from "@/lib/native-app";

const APP_STORE_URL = process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL ?? "";

/**
 * Open the separate T2QCAL app on this phone (its t2qcal:// link; the iOS
 * app hands custom links to iOS). iOS says nothing when no app answers, so a
 * short timer that the switch away cancels is the only signal: still here
 * after it, T2QCAL isn't installed (App Store page once there is one, else
 * say so). No account data travels in the link: before opening it, the
 * iPhone app leaves a one-time sign-in code where only the owner's own apps
 * can read it (offerT2QCALSignIn), so T2QCAL opens signed in to this account.
 */
const T2QHandoff = registerPlugin<{ offer(options: { code: string; userId: string }): Promise<void> }>("T2QHandoff");

/**
 * Sign T2QCAL in as this account: a one-time code from the server, left in a
 * pasteboard only the owner's own apps can read (never in the link). T2QCAL
 * takes it when it opens. Best-effort and quick: if anything fails, T2QCAL
 * still opens and offers its own sign-in. Only in the iPhone app.
 */
export async function offerT2QCALSignIn(): Promise<boolean> {
  if (!isNativeIOSApp() || !Capacitor.isPluginAvailable("T2QHandoff")) return false;
  try {
    const res = await fetch("/api/t2qcal/handoff", { method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(2500) });
    if (!res.ok) return false;
    const { code, userId } = (await res.json()) as { code?: string; userId?: string };
    if (!code || !userId) return false;
    await T2QHandoff.offer({ code, userId });
    return true;
  } catch {
    return false;
  }
}

export function useT2QCALLaunch(route: T2QCALRoute) {
  const [missing, setMissing] = useState(false);
  const timer = useRef<number | null>(null);
  const cleanupRef = useRef<() => void>(() => {});

  useEffect(() => () => cleanupRef.current(), []);

  const launch = useCallback(async () => {
    setMissing(false);
    cleanupRef.current();
    await offerT2QCALSignIn();
    const onHide = () => {
      if (document.hidden) cleanup();
    };
    const cleanup = () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", cleanup);
    };
    cleanupRef.current = cleanup;
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", cleanup);
    window.location.href = calculatorDeepLink(route);
    timer.current = window.setTimeout(() => {
      cleanup();
      if (APP_STORE_URL) window.location.href = APP_STORE_URL;
      else setMissing(true);
    }, T2QCAL_LAUNCH_WAIT_MS);
  }, [route]);

  return { launch, missing };
}

export const T2QCAL_MISSING = "T2QCAL isn’t on this phone yet.";

/** Home's quick-action tile: T2QCAL's own icon, opening the T2QCAL app. */
export function T2QCALTile({ className }: { className?: string }) {
  const { launch, missing } = useT2QCALLaunch("tools");
  return (
    <button
      type="button"
      onClick={() => void launch()}
      data-quick="t2qcal"
      data-testid="launch-t2qcal"
      className={cx(
        "ui-focus-ring flex min-h-12 w-full flex-col items-center gap-1.5 rounded-ui-lg p-1 text-center text-ui-xs font-semibold text-ui-text",
        TAP,
        PRESS,
        UI_TEXT,
        className,
      )}
    >
      <Image
        src="/t2qcal/native-icon.png"
        alt=""
        width={64}
        height={64}
        className="aspect-square w-full max-w-16 rounded-ui-lg border border-ui-line"
      />
      <span aria-live="polite">{missing ? "Not installed" : "T2QCAL"}</span>
      <span className="sr-only">{missing ? T2QCAL_MISSING : "Opens the T2QCAL app"}</span>
    </button>
  );
}

/** A row in the photo menu: opens the T2QCAL app. */
export function T2QCALRow() {
  const { launch, missing } = useT2QCALLaunch("tools");
  return (
    <button
      type="button"
      onClick={() => void launch()}
      data-testid="account-sheet-t2qcal"
      className={cx(
        "ui-focus-ring flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-ui-base hover:bg-ui-surface-2 active:bg-ui-surface-2",
        TAP,
        UI_TEXT,
      )}
    >
      <Image src="/t2qcal/native-icon.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-ui-md" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ui-text">Open T2QCAL</span>
        <span aria-live="polite" className={cx("block text-ui-sm", missing ? "text-ui-warn" : "text-ui-muted")}>
          {missing ? T2QCAL_MISSING : "Calculators and measuring, in the T2QCAL app"}
        </span>
      </span>
      <ArrowSquareOut aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
    </button>
  );
}
