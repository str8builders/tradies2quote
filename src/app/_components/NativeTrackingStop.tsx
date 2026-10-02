"use client";

import { useEffect } from "react";
import { stopNativeTracking } from "@/lib/location/device";
import { endClockActivity } from "@/lib/native/clock-activity";

/**
 * For the sign-in page: in the iPhone app, stops location there and then
 * (no route sent, no job sites watched) and forgets the upload key, unsent
 * route and saved arrivals, so whoever signs in next on this phone starts
 * from nothing. It also ends the "Clocked in" timer on the Lock Screen and
 * Dynamic Island: the sign-out button ends it too, but an expired session or
 * a deleted account lands here without pressing it. Nobody is signed in here
 * (the proxy sends signed-in people on to /app), so there's nothing to track
 * or time. Renders nothing; does nothing in a browser.
 */
export function NativeTrackingStop() {
  useEffect(() => {
    void stopNativeTracking();
    void endClockActivity();
  }, []);
  return null;
}
