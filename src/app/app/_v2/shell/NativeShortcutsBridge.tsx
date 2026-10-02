"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { connectShortcuts } from "@/lib/native/shortcuts";

/**
 * Opens the page a Home Screen quick action asked for (press and hold the app
 * icon: New quote, Timesheet, Jobs, Scan a supplier quote). Mounted once in
 * the app shell, like <PushBridge>: it collects an action that launched the
 * app, and listens for one that arrives while the app is open.
 *
 * Renders nothing; does nothing outside the iPhone app.
 */
export function NativeShortcutsBridge() {
  const router = useRouter();

  useEffect(() => connectShortcuts((path) => router.push(path)), [router]);

  return null;
}
