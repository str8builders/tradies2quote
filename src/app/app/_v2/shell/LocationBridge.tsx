"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { currentFix, hasNativeLocation, nativeLocation, type SiteEvent } from "@/lib/location/device";
import { clockIn, clockOut, getLocationState, issueDeviceKey, sendRoutePoints } from "../../timesheet/location-actions";
import type { LocationState } from "../../timesheet/_lib/location-types";

/** Pages dispatch this after changing the location setting or clocking in/out. */
export const LOCATION_CHANGED = "t2q:location-changed";

/** Ask every open page to re-read the location state. */
export function announceLocationChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCATION_CHANGED));
}

/** Web only: send the route every minute while clocked in and the page is open. */
const FLUSH_MS = 60_000;

/**
 * Keeps location in step with the account, on every page of the new look.
 *
 * - In the iPhone app: tells the T2QLocation module whether to send the
 *   route (clocked in), which job sites to watch (automatic clock-in on)
 *   and in which hours, and gives it an upload key once. Arrivals and
 *   departures it saw, even while the app was closed, come back here and
 *   clock in or out with the time they really happened.
 * - In a browser: while clocked in with location on and the page open,
 *   sends the route once a minute (a browser can't in the background).
 * - Location off: everything stops.
 */
export function LocationBridge() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let state: LocationState | null = null;
    let watchId: number | null = null;
    let flushTimer: number | null = null;
    let buffer: Array<{ t: number; lat: number; lng: number; acc: number | null }> = [];
    let chain: Promise<unknown> = Promise.resolve();
    const native = hasNativeLocation();

    const flush = () => {
      if (buffer.length === 0) return;
      const points = buffer;
      buffer = [];
      void sendRoutePoints(points).catch(() => {
        buffer = [...points, ...buffer].slice(-500);
      });
    };
    const stopWeb = () => {
      if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
      watchId = null;
      if (flushTimer !== null) window.clearInterval(flushTimer);
      flushTimer = null;
      flush();
    };
    const startWeb = () => {
      if (watchId !== null || !navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos.coords.accuracy > 100) return;
          buffer.push({ t: pos.timestamp, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
          if (buffer.length >= 200) flush();
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000 },
      );
      flushTimer = window.setInterval(flush, FLUSH_MS);
    };

    const sync = async () => {
      let next: LocationState;
      try {
        next = await getLocationState();
      } catch {
        return;
      }
      if (cancelled) return;
      state = next;
      if (native) {
        if (!next.consent.granted) {
          await nativeLocation.stopAll().catch(() => {});
          return;
        }
        let token: string | null = null;
        const status = await nativeLocation.status().catch(() => ({ hasToken: false }));
        if (!status.hasToken) {
          const key = await issueDeviceKey().catch(() => null);
          if (key && key.ok) token = key.value;
        }
        await nativeLocation
          .configure({
            endpoint: `${window.location.origin}/api/location/points`,
            token,
            tracking: Boolean(next.open),
            autoClock: next.consent.autoClock,
            sites: next.geofences.map((s) => ({ id: s.clientId, name: s.name, lat: s.lat, lng: s.lng, radius: s.radiusM })),
            window: {
              start: next.consent.workStart,
              end: next.consent.workEnd,
              days: next.consent.workDays,
              timeZone: next.timeZone,
            },
          })
          .catch(() => {});
      } else if (next.consent.granted && next.open && document.visibilityState === "visible") {
        startWeb();
      } else {
        stopWeb();
      }
    };

    // Arrivals and departures, one at a time, with the time they happened.
    const onSiteEvent = (event: SiteEvent) => {
      chain = chain.then(async () => {
        const now = state ?? (await getLocationState().catch(() => null));
        if (!now || !now.consent.granted || !now.consent.autoClock) return;
        const fix = event.lat != null && event.lng != null ? { lat: event.lat, lng: event.lng, acc: event.acc ?? null } : null;
        if (event.type === "enter" && !now.open) {
          await clockIn({ source: "auto", at: event.t, clientId: event.clientId, fix }).catch(() => null);
        } else if (event.type === "exit" && now.open?.source === "auto" && now.open.clientId === event.clientId) {
          await clockOut({ at: event.t, breakMinutes: 0, fix: fix ?? (await currentFix()) }).catch(() => null);
        } else {
          return;
        }
        await sync();
        router.refresh();
      });
    };

    let removeListener: (() => void) | null = null;
    if (native) {
      void nativeLocation.addListener("siteEvent", onSiteEvent).then((handle) => {
        if (cancelled) void handle.remove();
        else removeListener = () => void handle.remove();
      });
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
      else if (!native) stopWeb();
    };
    const onChanged = () => void sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(LOCATION_CHANGED, onChanged);
    void sync();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(LOCATION_CHANGED, onChanged);
      removeListener?.();
      if (!native) stopWeb();
    };
  }, [router]);

  return null;
}
