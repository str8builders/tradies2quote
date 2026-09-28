import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { HANDOFF_TTL_MS, handoffCodeHash, newHandoffCode } from "@/lib/t2qcal-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A one-time code that signs the T2QCAL app in as this account (see
 * src/lib/t2qcal-handoff.ts). Only for a signed-in tradie; the code lasts 60
 * seconds and works once. The Tradies2Quote iPhone app passes it to T2QCAL
 * through a pasteboard only the owner's apps can read — never in a link.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const quota = consumeFixedWindow(`t2qcal-handoff:${user.id}`, 10, 10 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const code = newHandoffCode();
  const now = Date.now();
  try {
    // Untyped: t2qcal_handoffs is newer than database.types.ts.
    const admin = adminClient() as unknown as SupabaseClient;
    // Tidy: codes are single-use and short-lived; nothing needs them after a day.
    await admin.from("t2qcal_handoffs").delete().lt("expires_at", new Date(now - 86_400_000).toISOString());
    const { error } = await admin.from("t2qcal_handoffs").insert({
      code_hash: handoffCodeHash(code),
      user_id: user.id,
      expires_at: new Date(now + HANDOFF_TTL_MS).toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    console.error("t2qcal handoff create failed", e);
    captureError(e, { route: "/api/t2qcal/handoff" });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { code, userId: user.id, expiresIn: HANDOFF_TTL_MS / 1000 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
