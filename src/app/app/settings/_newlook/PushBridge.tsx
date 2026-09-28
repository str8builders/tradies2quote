"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isNativeIOSApp } from "@/lib/native-app";
import { syncNativePushOnLaunch, watchNotificationTaps } from "./push";

/**
 * Native-only push bootstrap. Mounted once near the app root (the same
 * pattern as <LocationBridge> in src/app/app/_v2/shell/LocationBridge.tsx —
 * NOT currently wired in; see the audit report for the exact one-line
 * addition needed), it runs for the life of the app session:
 *
 *   - on mount ("app launch" for a Capacitor shell, since the layout that
 *     hosts this doesn't remount between in-app navigations), silently
 *     re-registers for APNs if the phone already granted permission, so a
 *     reinstall or a rotated token keeps working without anyone having to
 *     visit Settings and flip the switch (audit finding 5);
 *   - listens for a tapped push notification and opens the page it's
 *     about, the same way the web service worker already does.
 *
 * Renders nothing; no-ops entirely outside the native iOS shell.
 */
export function PushBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!isNativeIOSApp()) return;
    let cancelled = false;
    let cleanup: (() => void) | null = null;

    void syncNativePushOnLaunch();
    void watchNotificationTaps((url) => router.push(url)).then((remove) => {
      if (cancelled) remove();
      else cleanup = remove;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [router]);

  return null;
}
