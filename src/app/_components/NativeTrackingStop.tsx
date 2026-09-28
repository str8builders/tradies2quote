"use client";

import { useEffect } from "react";
import { stopNativeTracking } from "@/lib/location/device";

/**
 * For the sign-in page: in the iPhone app, stops location there and then
 * (no route sent, no job sites watched) and forgets the upload key, unsent
 * route and saved arrivals, so whoever signs in next on this phone starts
 * from nothing. Nobody is signed in here (the proxy sends signed-in people
 * on to /app), so there's nothing to track. Renders nothing; does nothing
 * in a browser.
 */
export function NativeTrackingStop() {
  useEffect(() => {
    void stopNativeTracking();
  }, []);
  return null;
}
