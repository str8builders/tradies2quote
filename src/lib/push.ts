import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { sendApnsNotification } from "@/lib/apns";

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
 * Send a push notification to every device a user has subscribed.
 *
 * Uses the service-role client so it works when the recipient isn't the
 * authenticated caller (e.g. a customer accepting a quote fires a push
 * to the quote owner). Never throws — push is a side benefit, not part
 * of the request's success path. Expired subscriptions (404/410) are
 * pruned so the table stays clean.
 */
export async function sendPushToUser(
  userId: string | null | undefined,
  payload: PushPayload,
): Promise<void> {
  if (!userId || !ensureConfigured()) return;
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
        // same way expired web endpoints are.
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
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } else if (!result.ok && result.reason !== "not_configured") {
            console.warn("apns send failed", result.status, result.reason);
          }
          return;
        }

        if (!sub.p256dh || !sub.auth) return; // malformed web row — skip
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
          if (code === 404 || code === 410) {
            await admin
              .from("push_subscriptions")
              .delete()
              .eq("endpoint", sub.endpoint);
          } else {
            console.warn("push send failed", code, e);
          }
        }
      }),
    );
  } catch (e) {
    console.warn("sendPushToUser failed (non-fatal)", e);
  }
}
