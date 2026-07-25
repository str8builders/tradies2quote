"use client";

import { useEffect } from "react";
import { isNativeIOSApp } from "@/lib/native-app";

/**
 * Inside the iOS App Store shell the marketing landing page must never
 * render: it carries trial CTAs and (behind <HideInNativeApp>) pricing —
 * Guideline 3.1.3(f) requires ZERO purchase surfaces in the binary, and a
 * marketing homepage inside the webview also reads as a website wrapper
 * (Guideline 4.2).
 *
 * The shell launches at /app, but the landing stays reachable via the
 * auth screens' back-to-home logo links and /help's "home" link — all
 * same-origin, so they stay inside the webview. This mounts at the top
 * of the landing page and bounces any native-shell visit straight back
 * into the product. `replace` keeps the landing out of history so the
 * webview back gesture doesn't ping-pong.
 *
 * Renders nothing; on the web it's a no-op.
 */
export function NativeAppRedirect() {
  useEffect(() => {
    if (isNativeIOSApp()) {
      window.location.replace("/app");
    }
  }, []);

  return null;
}
