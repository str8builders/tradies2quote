import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
  /** Wave 46 — iOS App Store shell registrations. */
  platform?: unknown;
  token?: unknown;
};

/**
 * Store a push subscription for the signed-in tradie. Upserts on the
 * unique `endpoint` so re-enabling on the same device doesn't duplicate.
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

  // iOS App Store shell — APNs device token registration.
  if (body.platform === "ios") {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    // APNs tokens are hex; length varies by device generation. Bound it
    // so junk can't fill the column.
    if (!/^[0-9a-f]{32,200}$/i.test(token)) {
      return NextResponse.json({ error: "invalid_token" }, { status: 400 });
    }
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: token,
        p256dh: null,
        auth: null,
        platform: "ios",
        user_agent: request.headers.get("user-agent"),
      },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("apns subscribe failed", error);
      return NextResponse.json({ error: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "invalid_subscription" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      platform: "web",
      user_agent: request.headers.get("user-agent"),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    console.error("push subscribe failed", error);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
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
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
