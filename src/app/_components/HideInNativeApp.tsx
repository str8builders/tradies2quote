"use client";

import { useSyncExternalStore } from "react";
import { isNativeIOSApp } from "@/lib/native-app";

/**
 * Renders children everywhere EXCEPT inside the iOS App Store shell.
 *
 * Guideline 3.1.3(f): the iOS binary must show no pricing, upgrade
 * buttons, or billing links. Wrap every money-shaped surface (trial
 * upgrade banner, /app/upgrade content, the settings subscription
 * panel) in this. On the web it's a no-op wrapper.
 *
 * Uses useSyncExternalStore's server/client snapshot split so SSR and
 * the browser both render the children (no hydration mismatch); the
 * native shell — where `window.Capacitor` exists before hydration —
 * drops them in the very first client render, so nothing flashes.
 */
const emptySubscribe = () => () => {};

export function HideInNativeApp({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  /** Optional replacement shown ONLY in the native shell. */
  fallback?: React.ReactNode;
}) {
  const native = useSyncExternalStore(
    emptySubscribe,
    isNativeIOSApp, // client snapshot
    () => false, // server snapshot — SSR renders children
  );

  if (native) return <>{fallback}</>;
  return <>{children}</>;
}
