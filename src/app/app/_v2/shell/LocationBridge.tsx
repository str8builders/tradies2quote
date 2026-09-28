"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  deviceTimeZone,
  eventOutcome,
  isSignOutAction,
  nativeApi,
  needsDeviceKey,
  planSiteEvent,
  zoneMark,
  type ActionAnswer,
} from "@/lib/location/bridge-rules";
import {
  currentFix,
  hasNativeLocation,
  nativeLocation,
  stopNativeTracking,
  type NativeStatus,
  type SiteEvent,
} from "@/lib/location/device";
import { flushRoutePoints, registerRouteFlusher } from "@/lib/location/route-flush";
import {
  clockIn,
  clockOut,
  getLocationState,
  issueDeviceKey,
  saveDeviceTimeZone,
  sendRoutePoints,
} from "../../timesheet/location-actions";
import type { LocationState } from "../../timesheet/_lib/location-types";

/** Pages dispatch this after changing the location setting or clocking in/out. */
export const LOCATION_CHANGED = "t2q:location-changed";

/** Ask every open page to re-read the location state. */
export function announceLocationChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LOCATION_CHANGED));
}

/** Web only: send the route every minute while clocked in and the page is open. */
const FLUSH_MS = 60_000;

/** sessionStorage: the account and zone last offered as the business's time zone (once per tab). */
const ZONE_KEY = "t2q.zone";

function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Private mode or storage off: it's offered again next page, no harm.
  }
}

/**
 * Keeps location in step with the account, on every page of the new look.
 *
 * - In the iPhone app: tells the T2QLocation module whose it is (the
 *   upload key, route and arrivals are tied to the signed-in account),
 *   whether to send the route (clocked in), which job sites to watch
 *   (automatic clock-in on) and in which hours, and gives it an upload key
 *   when it needs one. Arrivals and departures it saw, even while the app
 *   was closed, come back here and clock in or out with the time they
 *   really happened; the phone forgets each one only once the server has
 *   it, so no signal means another go later, not a lost clock-in.
 * - In a browser: while clocked in with location on and the page open,
 *   sends the route once a minute (a browser can't in the background).
 * - Before any Finish (see route-flush), the route still waiting is sent.
 * - Signing out stops the phone's tracking and forgets its key.
 * - The phone's or browser's time zone is offered as the business's (the
 *   server keeps it only when it's in the business's country).
 * - Location off: everything stops.
 */
export function LocationBridge() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    /** Signing out: nothing may switch tracking back on from here. */
    let signedOut = false;
    let state: LocationState | null = null;
    let api = 1;
    let watchId: number | null = null;
    let flushTimer: number | null = null;
    let buffer: Array<{ t: number; lat: number; lng: number; acc: number | null }> = [];
    let chain: Promise<void> = Promise.resolve();
    const native = hasNativeLocation();
    const stopped = () => cancelled || signedOut;

    // ── The route from a browser ─────────────────────────────────────────
    const flushWeb = async () => {
      if (buffer.length === 0) return;
      const points = buffer;
      buffer = [];
      await sendRoutePoints(points).catch(() => {
        buffer = [...points, ...buffer].slice(-500);
      });
    };
    const stopWeb = () => {
      if (watchId !== null) navigator.geolocation?.clearWatch(watchId);
      watchId = null;
      if (flushTimer !== null) window.clearInterval(flushTimer);
      flushTimer = null;
      void flushWeb();
    };
    const startWeb = () => {
      if (watchId !== null || !navigator.geolocation) return;
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (pos.coords.accuracy > 100) return;
          buffer.push({ t: pos.timestamp, lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy });
          if (buffer.length >= 200) void flushWeb();
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 15000 },
      );
      flushTimer = window.setInterval(() => void flushWeb(), FLUSH_MS);
    };

    // Finish work sends what's still waiting first (ClockCard, and departures below).
    const unregisterFlusher = registerRouteFlusher(async () => {
      if (!native) await flushWeb();
      else if (api >= 2) await nativeLocation.flush();
    });

    // ── The iPhone app ───────────────────────────────────────────────────
    const configureNative = async (next: LocationState) => {
      if (!next.consent.granted) {
        await stopNativeTracking();
        return;
      }
      const status = await nativeLocation.status().catch((): NativeStatus | null => null);
      api = nativeApi(status);
      let token: string | null = null;
      if (needsDeviceKey(status, next.userId)) {
        const key = await issueDeviceKey().catch(() => null);
        if (key && key.ok) token = key.value;
      }
      if (stopped()) return;
      await nativeLocation
        .configure({
          userId: next.userId,
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
          openSite: next.open?.clientId ? { clientId: next.open.clientId, auto: next.open.source === "auto" } : null,
        })
        .catch(() => {});
    };

    /** Re-read the state and set tracking to match. False when it couldn't be read. */
    const refresh = async (): Promise<boolean> => {
      let next: LocationState;
      try {
        next = await getLocationState();
      } catch {
        return false;
      }
      if (stopped()) return false;
      state = next;
      if (native) await configureNative(next);
      else if (next.consent.granted && next.open && document.visibilityState === "visible") startWeb();
      else stopWeb();
      return !stopped();
    };

    // Arrivals and departures the phone saw (even with the app closed), in
    // order, with the time they happened. Each is confirmed to the phone once
    // the server has it or it no longer applies; one that failed for want of
    // signal waits, with everything after it, for the next go.
    const drain = async () => {
      const userId = state?.userId;
      if (!userId || !state?.consent.granted) return;
      const legacy = api < 2;
      const none = { events: [] as SiteEvent[] };
      const { events } = legacy
        ? await nativeLocation.drainEvents().catch(() => none)
        : await nativeLocation.pendingEvents({ userId }).catch(() => none);
      let changed = false;
      for (const event of events ?? []) {
        if (stopped() || !state) break;
        const plan = planSiteEvent(event, state, Date.now());
        let answer: ActionAnswer = { ok: true };
        if (plan.kind === "clockIn") {
          answer = await clockIn({ source: "auto", at: plan.at, clientId: plan.clientId, fix: plan.fix }).catch(() => null);
        } else if (plan.kind === "clockOut") {
          await flushRoutePoints();
          const fix = plan.fix ?? (plan.askFix ? await currentFix() : null);
          answer = await clockOut({ at: plan.at, breakMinutes: 0, fix }).catch(() => null);
        }
        if (!legacy && eventOutcome(answer) === "retry") break;
        if (plan.kind !== "skip" && answer?.ok) {
          changed = true;
          // The next event needs to know you're clocked in now (or not), and
          // so does the phone before it forgets this one (a departure from
          // here still has to count). Couldn't tell it: the next go does.
          if (!(await refresh()) && !legacy) break;
        }
        if (!legacy && event.id) await nativeLocation.ackEvents({ ids: [event.id] }).catch(() => {});
      }
      if (changed && !stopped()) router.refresh();
    };

    // ── The business's time zone ─────────────────────────────────────────
    const offerTimeZone = async () => {
      const userId = state?.userId;
      const zone = deviceTimeZone();
      if (!userId || !zone) return;
      const mark = zoneMark(userId, zone);
      if (readSession(ZONE_KEY) === mark) return;
      const result = await saveDeviceTimeZone(zone).catch(() => null);
      if (!result || stopped()) return;
      writeSession(ZONE_KEY, mark);
      if (result.changed) {
        router.refresh();
        void sync();
      }
    };

    // One at a time: reading the state, telling the phone, then its events.
    const sync = (): Promise<void> => {
      chain = chain
        .then(async () => {
          if (stopped() || !(await refresh())) return;
          void offerTimeZone();
          if (native) await drain();
        })
        .catch(() => {});
      return chain;
    };

    let removeListener: (() => void) | null = null;
    if (native) {
      void nativeLocation
        .addListener("siteEvent", () => void sync())
        .then((handle) => {
          if (cancelled) void handle.remove();
          else removeListener = () => void handle.remove();
        })
        .catch(() => {});
    }

    // Signing out (the /auth/signout forms): the phone stops tracking and
    // forgets the key before the next person can sign in on it.
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const action = event.submitter?.getAttribute("formaction") ?? form.getAttribute("action");
      if (!isSignOutAction(action, window.location.href)) return;
      signedOut = true;
      if (native) void stopNativeTracking();
      else stopWeb();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
      else if (!native) stopWeb();
    };
    const onChanged = () => void sync();
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(LOCATION_CHANGED, onChanged);
    void sync();

    return () => {
      cancelled = true;
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(LOCATION_CHANGED, onChanged);
      removeListener?.();
      unregisterFlusher();
      if (!native) stopWeb();
    };
  }, [router]);

  return null;
}
