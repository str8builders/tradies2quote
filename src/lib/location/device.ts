/**
 * Location on this device (browser code). Inside the Tradies2Quote iPhone
 * app it talks to the app's own T2QLocation module (background route while
 * clocked in, job-site arrival alerts, notifications); anywhere else it uses
 * the browser's location, and only while the page is open.
 */

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { isNativeIOSApp } from "@/lib/native-app";
import type { Fix } from "./fix";

export type { Fix } from "./fix";

export type LocationPermission = "always" | "whenInUse" | "denied" | "restricted" | "notDetermined";

export interface SiteEvent {
  type: "enter" | "exit";
  clientId: string;
  /** When it happened (ms), which may be well before the app saw it. */
  t: number;
  lat?: number | null;
  lng?: number | null;
  acc?: number | null;
}

export interface NativeConfig {
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
  requestAlways(): Promise<{ status: LocationPermission }>;
  status(): Promise<{ hasToken: boolean; tracking: boolean; watching: number }>;
  configure(options: NativeConfig): Promise<void>;
  /** Arrivals and departures saved since last asked (oldest first). */
  drainEvents(): Promise<{ events: SiteEvent[] }>;
  stopAll(): Promise<void>;
  openSettings(): Promise<void>;
  /** A nudge that events are waiting (collect them with drainEvents). */
  addListener(event: "siteEvent", listener: () => void): Promise<PluginListenerHandle>;
}

const T2QLocation = registerPlugin<T2QLocationPlugin>("T2QLocation");

/** The iPhone app with the location module (newer installs). */
export function hasNativeLocation(): boolean {
  return isNativeIOSApp() && Capacitor.isPluginAvailable("T2QLocation");
}

export const nativeLocation = T2QLocation;

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
