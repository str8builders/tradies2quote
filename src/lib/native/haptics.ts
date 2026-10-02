/**
 * A short tap of feedback in the iPhone app (browser code), for the moments
 * that matter: starting and stopping a recording, a quote going out, clocking
 * in and out. Nothing happens anywhere else (Safari, an installed web app, an
 * older copy of the app), and a failure is never the page's problem.
 */

import { registerPlugin } from "@capacitor/core";
import { hasNativeModule } from "./plugins";

export type Haptic = "tap" | "heavy" | "success" | "warning";

interface T2QHapticsPlugin {
  impact(options: { style: "light" | "medium" | "heavy" }): Promise<void>;
  notification(options: { type: "success" | "warning" | "error" }): Promise<void>;
}

const T2QHaptics = registerPlugin<T2QHapticsPlugin>("T2QHaptics");

export function haptic(kind: Haptic): void {
  if (!hasNativeModule("T2QHaptics")) return;
  const done = () => {};
  try {
    const call =
      kind === "success" || kind === "warning"
        ? T2QHaptics.notification({ type: kind })
        : T2QHaptics.impact({ style: kind === "heavy" ? "heavy" : "light" });
    void call.then(done, done);
  } catch {
    // The phone said no: the page carries on.
  }
}
