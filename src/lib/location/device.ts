/**
 * Location on this device (browser code). Inside the Tradies2Quote iPhone
 * app it talks to the app's own T2QLocation module (the route while clocked
 * in, job-site arrival alerts, notifications); anywhere else it uses the
 * browser's location, and only while the page is open.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeIOSApp } from "@/lib/native-app";
import type { Fix } from "./fix";

export type { Fix } from "./fix";

export type LocationPermission = "always" | "whenInUse" | "denied" | "restricted" | "notDetermined";

export interface SiteEvent {
  /** Set by app builds that keep events until the page confirms them (api 2). */
  id?: string;
  type: "enter" | "exit";
  clientId: string;
  /** When it happened (ms), which may be well before the app saw it. */
  t: number;
  lat?: number | null;
  lng?: number | null;
  acc?: number | null;
}

export interface NativeStatus {
  /** 2: events kept until acknowledged, flush, and the key tied to `userId`. Missing on older builds. */
  api?: number;
  hasToken: boolean;
  tracking: boolean;
  watching: number;
  /** The account this phone's key, route and events belong to (api 2). */
  userId?: string | null;
}

export interface NativeConfig {
  /**
   * The signed-in account (api 2). The app forgets the key, route and
   * events of anyone else first, so nothing carries over between people
   * sharing a phone.
   */
  userId?: string | null;
  /** Where the phone posts the route from the background. */
  endpoint: string;
  /** A new upload key for the keychain, or null to keep the one it has. */
  token: string | null;
  /** Clocked in: send the route. */
  tracking: boolean;
  /** Watch job sites for arrival and leaving. */
  autoClock: boolean;
  sites: Array<{ id: string; name: string; lat: number; lng: number; radius: number }>;
  /** Automatic clock-in only inside these hours, in the business's time zone. */
  window: { start: string; end: string; days: number[]; timeZone: string };
  /** Clocked in at a site (and whether automatically): leaving it can clock out. */
  openSite: { clientId: string; auto: boolean } | null;
}

interface T2QLocationPlugin {
  currentPosition(): Promise<{ lat: number; lng: number; acc: number; t: number }>;
  permission(): Promise<{ status: LocationPermission }>;
  /** "While using the app": pins, travel while it's open, weather. */
  requestWhenInUse(): Promise<{ status: LocationPermission }>;
  /** "Always": only for automatic clock-in (asks "while using" first when needed). */
  requestAlways(): Promise<{ status: LocationPermission }>;
  status(): Promise<NativeStatus>;
  configure(options: NativeConfig): Promise<void>;
  /** api 2: arrivals and departures not yet acknowledged (oldest first), for this account only. */
  pendingEvents(options: { userId: string }): Promise<{ events: SiteEvent[] }>;
  /** api 2: the server has these (or they no longer apply): forget them. */
  ackEvents(options: { ids: string[] }): Promise<void>;
  /** Older builds: arrivals and departures saved since last asked (oldest first), handed over and forgotten. */
  drainEvents(): Promise<{ events: SiteEvent[] }>;
  /** api 2: send the saved route now; resolves once it's sent (or can't be). */
  flush(): Promise<void>;
  /** Stop tracking and watching, and forget the key, route and events. */
  stopAll(): Promise<void>;
  openSettings(): Promise<void>;
  /** A nudge that events are waiting (collect them with pendingEvents or drainEvents). */
  addListener(event: "siteEvent", listener: () => void): Promise<PluginListenerHandle>;
}

const T2QLocation = registerPlugin<T2QLocationPlugin>("T2QLocation");

/** The iPhone app with the location module (newer installs). */
export function hasNativeLocation(): boolean {
  return isNativeIOSApp() && Capacitor.isPluginAvailable("T2QLocation");
}

export const nativeLocation = T2QLocation;

/**
 * Stop location on this iPhone: no route, no job sites watched, and the
 * upload key, unsent route and saved arrivals forgotten. For signing out
 * (and the sign-in page), so the next person on the phone inherits nothing.
 * Does nothing in a browser; never throws.
 */
export async function stopNativeTracking(): Promise<void> {
  if (!hasNativeLocation()) return;
  try {
    await T2QLocation.stopAll();
  } catch {
    // A busy bridge: the next sign-in still starts clean, as configure()
    // forgets whatever belonged to another account.
  }
}

/** Where the phone is now, or null (no permission, no fix in 12 s). */
export async function currentFix(): Promise<Fix | null> {
  if (hasNativeLocation()) {
    try {
      const p = await T2QLocation.currentPosition();
      return { lat: p.lat, lng: p.lng, acc: p.acc };
    } catch {
      return null;
    }
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}
