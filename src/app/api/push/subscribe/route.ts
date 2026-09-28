import { isPushServiceEndpoint } from "@/lib/push-endpoint";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { captureError } from "@/lib/observability";
import { PUSH_SUBSCRIPTION_COOKIE, pushSubscriptionCookieOptions } from "@/lib/push-subscription-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  /** Wave 46 — iOS App Store shell registrations. */
  platform?: unknown;
  token?: unknown;
};

type SubscriptionRow = {
  user_id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  platform: "web" | "ios";
  user_agent: string | null;
};

/**
 * Remove any existing row for this endpoint/token — it may belong to a
 * DIFFERENT account: the same phone re-subscribing after a sign-out, or a
 * second account on the same device, both reuse the identical web-push
 * endpoint or APNs token — then insert fresh for the current user.
 *
 * Uses the admin (service-role) client, on purpose, ONLY after the caller
 * has already confirmed a signed-in user: the endpoint/token column is
 * unique, and the per-owner RLS policy only ever lets a user see their OWN
 * row, so a plain upsert from the user-scoped client raised an RLS/unique
 * -constraint error whenever the row collided with another account's — the
 * route had no choice but to turn that into a bare 500 (audit finding 2).
 */
async function replaceSubscription(
  admin: SupabaseClient,
  row: SubscriptionRow,
): Promise<{ id: string } | { error: unknown }> {
  const del = await admin.from("push_subscriptions").delete().eq("endpoint", row.endpoint);
  if (del.error) return { error: del.error };
  const { data, error } = await admin.from("push_subscriptions").insert(row).select("id").single();
  if (error || !data) return { error: error ?? new Error("insert returned no row") };
  return { id: (data as { id: string }).id };
}

/** Remembers, in an httpOnly cookie, which row belongs to THIS browser/phone (see push-subscription-cookie.ts) — read back by /auth/signout so it can delete exactly that row. */
function withSubscriptionCookie(response: NextResponse, rowId: string): NextResponse {
  response.cookies.set(PUSH_SUBSCRIPTION_COOKIE, rowId, pushSubscriptionCookieOptions());
  return response;
}

/**
 * Store a push subscription for the signed-in tradie.
 *
 * Two shapes:
 *   * Web Push (default): { endpoint, keys: { p256dh, auth } }
 *   * iOS shell (APNs):   { platform: "ios", token } — the device token
 *     is stored in `endpoint` with the VAPID key columns null.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SubBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const admin = adminClient() as unknown as SupabaseClient;

  // iOS App Store shell — APNs device token registration.
  if (body.platform === "ios") {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    // APNs tokens are hex; length varies by device generation. Bound it
    // so junk can't fill the column.
    if (!/^[0-9a-f]{32,200}$/i.test(token)) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    const result = await replaceSubscription(admin, {
      user_id: user.id,
      endpoint: token,
      p256dh: null,
      auth: null,
      platform: "ios",
      user_agent: request.headers.get("user-agent"),
    });
    if ("error" in result) {
      console.error("apns subscribe failed", result.error);
      captureError(result.error, { route: "/api/push/subscribe" });
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    return withSubscriptionCookie(NextResponse.json({ ok: true }), result.id);
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }
  // The server later POSTs to this URL (web-push). Only accept the browsers'
  // own push services, over https, at sane sizes — never an arbitrary host.
  if (!isPushServiceEndpoint(endpoint) || p256dh.length > 300 || auth.length > 100 || !/^[A-Za-z0-9_=-]+$/.test(p256dh) || !/^[A-Za-z0-9_=-]+$/.test(auth)) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const result = await replaceSubscription(admin, {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    platform: "web",
    user_agent: request.headers.get("user-agent"),
  });
  if ("error" in result) {
    console.error("push subscribe failed", result.error);
    captureError(result.error, { route: "/api/push/subscribe" });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return withSubscriptionCookie(NextResponse.json({ ok: true }), result.id);
}

/** Remove a subscription (turn notifications off on this device). */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: SubBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  if (!endpoint) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  if (error) {
    console.error("push unsubscribe failed", error);
    captureError(error, { route: "/api/push/subscribe" });
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PUSH_SUBSCRIPTION_COOKIE, "", pushSubscriptionCookieOptions(0));
  return response;
}
