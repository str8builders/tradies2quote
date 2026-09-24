/**
 * Quote notifications for the new-look Account page: the same Web Push /
 * iOS-app push registration as the old account menu's <PushToggle>
 * (src/app/app/_components/PushToggle.tsx), with the wording pulled out so
 * it is tested in node. That file belongs to the navigation phase, so the
 * logic is mirrored here rather than shared; push.test.ts fails if the
 * two public keys ever drift apart. Fold them into one module when the old
 * look retires.
 *
 * Browser-only below `pushStatusText`: nothing runs at import time.
 */

// Fallback public key, only used when NEXT_PUBLIC_VAPID_PUBLIC_KEY isn't
// injected. MUST match PushToggle.tsx and the server's VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BM7pVHs5Nf2CSkOcrXxpaADkS4P4sq-6LjrtQ01bZUtxi0Om1jyja4NXW32CNG0KqwwtFcluG26_61xVT2xdGP0";

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
      return "On. You'll get a buzz when a client accepts a quote.";
    case "error":
      return "That didn't work. Try again in a minute.";
    case "working":
      return "One moment…";
    case "off":
      return "Get a buzz the moment a client accepts a quote.";
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

async function enableNativePush(): Promise<PushState> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== "granted") return "denied";

  const token = await new Promise<string | null>((resolve) => {
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
  if (!token) return "error";

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "ios", token }),
  });
  if (!res.ok) return "error";
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

/** Ask for permission and register this device. Never throws. */
export async function enablePush(native: boolean): Promise<PushState> {
  try {
    if (native) return await enableNativePush();
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "denied" : "off";
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
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
