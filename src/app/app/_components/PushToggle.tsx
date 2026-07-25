"use client";

import { useEffect, useState } from "react";
import { isNativeIOSApp } from "@/lib/native-app";
import {
  BellSimple,
  BellSimpleSlash,
  CircleNotch,
} from "@phosphor-icons/react";

// Fallback VAPID public key — only used in local dev when NEXT_PUBLIC_VAPID_PUBLIC_KEY
// isn't injected. Paired with the matching VAPID_PRIVATE_KEY rotated in Vercel
// after the Stripe-secret-contamination cleanup. If you ever rotate the keypair
// again, regenerate via `npx web-push generate-vapid-keys` and update BOTH this
// string AND the Vercel env vars (VAPID_PUBLIC_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY) in the same commit so they stay matched.
const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BM7pVHs5Nf2CSkOcrXxpaADkS4P4sq-6LjrtQ01bZUtxi0Om1jyja4NXW32CNG0KqwwtFcluG26_61xVT2xdGP0";

/** Convert a base64url VAPID key into the Uint8Array the Push API wants. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State =
  | "checking"
  | "unsupported"
  | "off"
  | "enabling"
  | "on"
  | "denied"
  | "error";

/**
 * Enable/disable Web Push for quote events. On iOS this only works once
 * the app is installed to the Home Screen (PushManager is absent in a
 * plain Safari tab) — we surface that as the "unsupported" hint.
 */
/**
 * Wave 46 — iOS App Store shell branch. Registers through Apple's push
 * service via @capacitor/push-notifications (Web Push doesn't exist in
 * WKWebView). Dynamic import keeps the plugin chunk off the web bundle.
 */
async function enableNativePush(): Promise<State> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return "denied";

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
    localStorage.setItem("t2q-apns-token", token);
  } catch {
    /* best effort — disable falls back gracefully */
  }
  return "on";
}

async function disableNativePush(): Promise<State> {
  let token: string | null = null;
  try {
    token = localStorage.getItem("t2q-apns-token");
  } catch {
    /* ignore */
  }
  if (token) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoint: token }),
    });
    try {
      localStorage.removeItem("t2q-apns-token");
    } catch {
      /* ignore */
    }
  }
  return "off";
}

export function PushToggle() {
  const [state, setState] = useState<State>("checking");
  const [nativeShell, setNativeShell] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // iOS App Store shell: register via APNs instead of Web Push.
      if (isNativeIOSApp()) {
        if (cancelled) return;
        setNativeShell(true);
        let hasToken = false;
        try {
          hasToken = Boolean(localStorage.getItem("t2q-apns-token"));
        } catch {
          /* ignore */
        }
        setState(hasToken ? "on" : "off");
        return;
      }
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setState("enabling");
    if (nativeShell) {
      try {
        setState(await enableNativePush());
      } catch (e) {
        console.error("native push enable failed", e);
        setState("error");
      }
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          VAPID_PUBLIC_KEY,
        ) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error(`subscribe ${res.status}`);
      setState("on");
    } catch (e) {
      console.error("enable push failed", e);
      setState("error");
    }
  }

  async function disable() {
    setState("enabling");
    if (nativeShell) {
      try {
        setState(await disableNativePush());
      } catch (e) {
        console.error("native push disable failed", e);
        setState("error");
      }
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      console.error("disable push failed", e);
      setState("error");
    }
  }

  if (state === "checking") return null;

  const isUnsupported = state === "unsupported";
  const isDenied = state === "denied";
  const isOn = state === "on";
  const busy = state === "enabling";

  const subtitle = isUnsupported
    ? "Add this app to your Home Screen, then reopen it to switch on push."
    : isDenied
      ? "Notifications are blocked — allow them in your phone/browser settings, then come back."
      : isOn
        ? "On — you'll get a push when a client accepts your quote."
        : state === "error"
          ? "Something went wrong. Tap to try again."
          : "Get a push the moment a client accepts your quote.";

  return (
    <div
      data-testid="push-toggle"
      className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">Quote notifications</p>
        <p className="mt-0.5 text-xs text-ink-300">{subtitle}</p>
      </div>
      {!isUnsupported && !isDenied && (
        <button
          type="button"
          onClick={isOn ? disable : enable}
          disabled={busy}
          data-testid="push-toggle-button"
          className={
            isOn
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-600 px-3.5 py-2 text-xs font-semibold text-ink-200 hover:border-brand hover:text-brand disabled:opacity-60"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-xs font-semibold text-ink-900 hover:bg-brand-400 disabled:opacity-60"
          }
        >
          {busy ? (
            <CircleNotch size={14} weight="bold" className="animate-spin" />
          ) : isOn ? (
            <BellSimpleSlash size={14} weight="bold" />
          ) : (
            <BellSimple size={14} weight="bold" />
          )}
          {busy ? "Working…" : isOn ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
