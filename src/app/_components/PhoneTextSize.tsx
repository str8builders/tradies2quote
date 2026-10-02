"use client";

import { useEffect } from "react";
import { isNativeIOSApp } from "@/lib/native-app";
import { followPhoneTextSize } from "@/lib/ui/text-size";

/** iOS can hand the page a new text size a moment after the app comes back. */
const RECHECK_MS = 1000;

/**
 * In the iPhone app, while no Text size has been picked in the app, the words
 * follow the text size set for the whole phone (Settings > Display &
 * Brightness > Text Size, or the Text Size control in Control Center): read on
 * open and again whenever the app comes back or gets focus again, so a change
 * shows straight away. A size picked in the app always wins. Renders nothing;
 * does nothing in a browser (src/lib/ui/text-size.ts, followPhoneTextSize).
 */
export function PhoneTextSize() {
  useEffect(() => {
    if (!isNativeIOSApp()) return;
    followPhoneTextSize();
    let later: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      followPhoneTextSize();
      clearTimeout(later);
      later = setTimeout(followPhoneTextSize, RECHECK_MS);
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    return () => {
      clearTimeout(later);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
    };
  }, []);
  return null;
}
