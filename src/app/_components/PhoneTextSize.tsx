"use client";

import { useEffect } from "react";
import { isNativeIOSApp } from "@/lib/native-app";
import { followPhoneTextSize } from "@/lib/ui/text-size";

/**
 * In the iPhone app, while no Text size has been picked in the app, the words
 * follow the text size set for the whole phone (Settings > Display &
 * Brightness > Text Size): read on open and again whenever the app comes back,
 * so a change made in Settings shows straight away. A size picked in the app
 * always wins. Renders nothing; does nothing in a browser
 * (src/lib/ui/text-size.ts, followPhoneTextSize).
 */
export function PhoneTextSize() {
  useEffect(() => {
    if (!isNativeIOSApp()) return;
    followPhoneTextSize();
    const onVisible = () => {
      if (document.visibilityState === "visible") followPhoneTextSize();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
