import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { sendApnsNotification } from "@/lib/apns";
import { isPushServiceEndpoint } from "@/lib/push-endpoint";
import { captureError } from "@/lib/observability";

/**
 * Public VAPID key — safe to expose (it's sent to every browser that
 * subscribes). Falls back to the generated key so the client can
 * subscribe even before env vars are set; override via VAPID_PUBLIC_KEY
 * / NEXT_PUBLIC_VAPID_PUBLIC_KEY.
 */
export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BMh1wyMbQoDS3zhC02ejkeknqX3v6wtZiN7ewUsaBjggVnPqHdDNKarEkcsQrvuPZI3tPFNQ-AvIWFfsfqfePLI";

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:challis836@gmail.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  // The private key is the secret half — without it we cannot sign a
  // push, so sending is a graceful no-op until it's set in env.
  if (!VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/**
 * Delete a dead/rejected subscription and report it ONCE via the internal
 * error sink (fingerprinted there, so repeats of the same reason collapse
 * into one grouped row instead of one alert per send) — a prune used to be
 * completely silent, so a systemic problem (e.g. a key mismatch rejecting
 * every push) was invisible until a tradie complained (audit finding 3).
 */
async function pruneSubscription(
  admin: SupabaseClient,
  endpoint: string,
  reason: string,
): Promise<void> {
  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  captureError(new Error(`push subscription pruned: ${reason}`), {
    route: "push/prune",
  });
}

/**
 * Send a push notification to every device a user has subscribed.
 *
 * Uses the service-role client so it works when the recipient isn't the
 * authenticated caller (e.g. a customer accepting a quote fires a push
 * to the quote owner). Never throws — push is a side benefit, not part
 * of the request's success path. Expired/rejected subscriptions (web:
 * 403/404/410, APNs: 410/BadDeviceToken) are pruned so the table stays
 * clean.
 *
 * VAPID configuration only gates the WEB branch — an iOS-only shop (APNs
 * env set, no VAPID keys) must still get APNs sends (previously the whole
 * function no-opped without VAPID keys, silently dropping every iOS push
 * too; audit finding 5).
 */
export async function sendPushToUser(
  userId: string | null | undefined,
  payload: PushPayload,
): Promise<void> {
  if (!userId) return;
  try {
    // The generated Database types don't include push_subscriptions yet,
    // so use a loosely-typed handle for this table (mirrors how the
    // server client is used untyped elsewhere).
    const admin = adminClient() as unknown as SupabaseClient;
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth, platform")
      .eq("user_id", userId);
    if (!subs || subs.length === 0) return;

    const body = JSON.stringify(payload);
    await Promise.all(
      subs.map(async (s) => {
        const sub = s as {
          endpoint: string;
          p256dh: string | null;
          auth: string | null;
          platform?: string | null;
        };

        // iOS App Store shell — endpoint holds the APNs device token
        // (Wave 46). Sent via APNs HTTP/2; dead tokens are pruned the
        // same way expired web endpoints are. Independent of VAPID/web-push
        // configuration — see the doc comment above.
        if (sub.platform === "ios") {
          const result = await sendApnsNotification(sub.endpoint, {
            title: payload.title,
            body: payload.body,
            url: payload.url,
          });
          if (
            !result.ok &&
            (result.status === 410 || result.reason === "BadDeviceToken")
          ) {
            await pruneSubscription(admin, sub.endpoint, `apns ${result.status} ${result.reason}`);
          } else if (!result.ok && result.reason !== "not_configured") {
            console.warn("apns send failed", result.status, result.reason);
            captureError(new Error(`apns send failed: ${result.status} ${result.reason}`), {
              route: "push/apns",
            });
          }
          return;
        }

        // Web push: needs VAPID configured. An APNs-only deployment has no
        // VAPID keys at all — that's an expected, silent no-op here, not a
        // failure to report.
        if (!ensureConfigured()) return;
        if (!sub.p256dh || !sub.auth) return; // malformed web row — skip

        // Re-check the endpoint is still one of the browsers' own push
        // services before POSTing to it. A CHECK constraint now blocks new
        // rows with a bad host (see the 20260929 push_subscriptions
        // migration), but it's NOT VALID against whatever already exists,
        // and defence-in-depth here costs nothing (audit finding 4 — this
        // used to trust every row in the table, so an attacker who got a
        // row past RLS could make the server POST to any https host).
        if (!isPushServiceEndpoint(sub.endpoint)) {
          await pruneSubscription(admin, sub.endpoint, "endpoint failed host allow-list");
          return;
        }

        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 403 || code === 404 || code === 410) {
            // 403 = the push service rejected our VAPID signature — the
            // subscription can never succeed until the browser re-subscribes
            // with whatever key the server is actually using now.
            await pruneSubscription(admin, sub.endpoint, `webpush ${code}`);
          } else {
            console.warn("push send failed", code, e);
            captureError(e, { route: "push/webpush" });
          }
        }
      }),
    );
  } catch (e) {
    console.warn("sendPushToUser failed (non-fatal)", e);
    captureError(e, { route: "push/sendPushToUser" });
  }
}
