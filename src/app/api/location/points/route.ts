import { NextResponse, type NextRequest } from "next/server";
import { hashDeviceToken, looksLikeDeviceToken } from "@/lib/location/device-token";
import { isValidLatLng } from "@/lib/location/geo";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import type { Json } from "@/lib/supabase/database.types";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/location/points — the iPhone app sending the route while
 * clocked in, from the background (no web page running). Authorised by the
 * phone's upload key (Bearer), not a cookie. The database keeps only points
 * inside the person's open session, and only while their location is on.
 * Body: { points: [{ t (ms), lat, lng, acc?, speed? }] } (up to 500).
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!looksLikeDeviceToken(token)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = consumeFixedWindow(`location-points:${hashDeviceToken(token).slice(0, 16)}`, 120, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequestsResponse(limit.resetAt);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const raw = (body as { points?: unknown } | null)?.points;
  if (!Array.isArray(raw) || raw.length > 500) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const points = raw
    .filter((p): p is { t: number; lat: number; lng: number; acc?: number; speed?: number } => {
      const q = p as Record<string, unknown>;
      return typeof q?.t === "number" && Number.isFinite(q.t) && isValidLatLng(q as { lat: number; lng: number });
    })
    .map((p) => ({ t: p.t, lat: p.lat, lng: p.lng, acc: p.acc ?? null, speed: p.speed ?? null }));

  try {
    const admin = adminClient();
    const { data: device } = await admin
      .from("location_devices")
      .select("id, user_id, revoked_at")
      .eq("token_hash", hashDeviceToken(token))
      .maybeSingle();
    if (!device || device.revoked_at) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    await admin.from("location_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    if (points.length === 0) return NextResponse.json({ ok: true, kept: 0 });
    const { data, error } = await admin.rpc("add_location_points", { p_user: device.user_id, p_points: points as unknown as Json });
    if (error) throw error;
    return NextResponse.json({ ok: true, kept: Number(data) || 0 });
  } catch (error) {
    captureError(error, { route: "api/location/points" });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
