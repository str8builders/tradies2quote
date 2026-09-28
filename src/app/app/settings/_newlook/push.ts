/**
 * Quote notifications for the new-look Account page: the same Web Push /
 * iOS-app push registration as the old account menu's <PushToggle>
 * (src/app/app/_components/PushToggle.tsx). That file belongs to the
 * navigation phase, so the logic is mirrored here rather than shared.
 * Fold them into one module when the old look retires.
 *
 * Browser-only below `pushStatusText`: nothing runs at import time.
 */

import { safeNextPath } from "@/lib/safe-redirect";

export type PushState = "checking" | "unsupported" | "off" | "working" | "on" | "denied" | "error";

/** One plain sentence under the switch, for every state. */
export function pushStatusText(state: PushState): string {
  switch (state) {
    case "checking":
      return "Checking this phone…";
    case "unsupported":
      return "Add Tradies2Quote to your Home Screen, then open it from there to turn this on.";
    case "denied":
      return "Notifications are blocked. Allow them for Tradies2Quote in your phone's settings, then come back.";
    case "on":
      return "On. You'll get a buzz when a client requests a quote, opens it, sends a message, or accepts it.";
    case "error":
      return "That didn't work. Try again in a minute.";
    case "working":
      return "One moment…";
    case "off":
      return "Get a buzz when a client requests a quote, opens it, sends a message, or accepts it.";
  }
}

/** The switch can only be flipped where the phone lets us ask. */
export function pushCanToggle(state: PushState): boolean {
  return state === "on" || state === "off" || state === "error";
}

const APNS_TOKEN_KEY = "t2q-apns-token";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function readApnsToken(): string | null {
  try {
    return localStorage.getItem(APNS_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * The browser must subscribe with the SAME public key the server signs
 * with, or the push service rejects every send (403) — silently, from the
 * subscriber's point of view, since the switch already says "on" (audit
 * finding 3: this file used to hard-code its own fallback key, which had
 * drifted from src/lib/push.ts's real one). Fetched fresh each time we
 * subscribe, rather than baked into the bundle at build time, so there is
 * exactly one source of truth: whatever the server is actually configured
 * with right now.
 */
async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch("/api/push/public-key");
  if (!res.ok) throw new Error(`public-key ${res.status}`);
  const json = (await res.json()) as { key?: unknown };
  if (typeof json.key !== "string" || !json.key) throw new Error("public-key missing");
  return json.key;
}

/** Where push stands on this device right now. */
export async function readPushState(native: boolean): Promise<PushState> {
  if (native) return readApnsToken() ? "on" : "off";
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    return subscription ? "on" : "off";
  } catch {
    return "off";
  }
}

/**
 * Register through Apple's push service and wait for the resulting token
 * (or a timeout / registrationError). Never throws — resolves `null` on any
 * failure. Shared by the switch (which first asks for permission) and the
 * silent app-launch resync below (which only re-registers when permission
 * is already granted).
 */
async function registerAndAwaitToken(): Promise<string | null> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    void PushNotifications.addListener("registration", (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    void PushNotifications.addListener("registrationError", () => {
      clearTimeout(timer);
      resolve(null);
    });
    void PushNotifications.register();
  });
}

async function postApnsToken(token: string): Promise<boolean> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "ios", token }),
  });
  return res.ok;
}

async function enableNativePush(): Promise<PushState> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return "denied";

  const token = await registerAndAwaitToken();
  if (!token) return "error";
  if (!(await postApnsToken(token))) return "error";
  try {
    localStorage.setItem(APNS_TOKEN_KEY, token);
  } catch {
    /* best effort: turning it off falls back gracefully */
  }
  return "on";
}

async function disableNativePush(): Promise<PushState> {
  const token = readApnsToken();
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: token }),
    });
    try {
      localStorage.removeItem(APNS_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
  return "off";
}

/**
 * Native only — call once near app launch (not gated behind this settings
 * page). If the phone already granted notification permission, silently
 * re-register and re-send the token: a reinstall, a restore, or Apple
 * rotating the token would otherwise sit unnoticed until someone happened
 * to open Settings and flip the switch off and back on (audit finding 5).
 * Never prompts — only the switch (enablePush) does that. Never throws.
 */
export async function syncNativePushOnLaunch(): Promise<void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const status = await PushNotifications.checkPermissions();
    if (status.receive !== "granted") return;
    const token = await registerAndAwaitToken();
    if (!token) return;
    if (await postApnsToken(token)) {
      try {
        localStorage.setItem(APNS_TOKEN_KEY, token);
      } catch {
        /* best effort */
      }
    }
  } catch (error) {
    console.error("native push relaunch sync failed", error);
  }
}

/**
 * Native only — tapping a delivered push should open the page it's about
 * (the `url` in the payload; see src/lib/apns.ts and the callers of
 * sendPushToUser), not just foreground the app on whatever screen it was
 * already showing (audit finding 5; Web Push already does this itself, in
 * public/sw.js's notificationclick handler). Call once near app launch;
 * returns a cleanup function. Never throws.
 */
export async function watchNotificationTaps(onUrl: (url: string) => void): Promise<() => void> {
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const handle = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification?.data as { url?: unknown } | undefined)?.url;
      // Payloads carry app paths (/app/quotes/preview/…); never follow
      // anything that would leave the app.
      const path = safeNextPath(url, "");
      if (path) onUrl(path);
    });
    return () => {
      void handle.remove();
    };
  } catch (error) {
    console.error("push tap listener failed", error);
    return () => {};
  }
}

/** Ask for permission and register this device. Never throws. */
export async function enablePush(native: boolean): Promise<PushState> {
  try {
    if (native) return await enableNativePush();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "off";
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const key = await fetchVapidPublicKey();
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
    });
    const json = subscription.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) throw new Error(`subscribe ${res.status}`);
    return "on";
  } catch (error) {
    console.error("enable push failed", error);
    return "error";
  }
}

/** Unregister this device. Never throws. */
export async function disablePush(native: boolean): Promise<PushState> {
  try {
    if (native) return await disableNativePush();
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      await subscription.unsubscribe();
    }
    return "off";
  } catch (error) {
    console.error("disable push failed", error);
    return "error";
  }
}
