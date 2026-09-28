import { NextResponse, type NextRequest } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { handoffCodeHash, parseHandoffCode } from "@/lib/t2qcal-handoff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * T2QCAL trades a one-time code (from the Tradies2Quote iPhone app, see
 * ../route.ts) for its own session of the same account. The code must be
 * unused and under 60 seconds old, and is spent by this call whatever
 * happens next. The session is made the way an email sign-in link makes one
 * (an admin-generated magic link, verified here and never sent anywhere), so
 * T2QCAL gets an ordinary refresh token it can keep and renew.
 */
export async function POST(request: NextRequest) {
  const quota = consumeFixedWindow(`t2qcal-redeem:${requestIp(request)}`, 30, 10 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const code = parseHandoffCode(body?.code);
  if (!code) return NextResponse.json({ error: "invalid_code" }, { status: 400, headers: NO_STORE });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });

  try {
    // Untyped: t2qcal_handoffs is newer than database.types.ts.
    const admin = adminClient() as unknown as SupabaseClient;
    const now = new Date().toISOString();
    // Spend the code first (atomically): unused and unexpired, or nothing.
    const { data: spent, error: spendError } = await admin
      .from("t2qcal_handoffs")
      .update({ used_at: now })
      .eq("code_hash", handoffCodeHash(code))
      .is("used_at", null)
      .gt("expires_at", now)
      .select("user_id");
    if (spendError) throw spendError;
    const userId = (spent as Array<{ user_id: string }> | null)?.[0]?.user_id;
    if (!userId) return NextResponse.json({ error: "expired" }, { status: 400, headers: NO_STORE });

    const { data: found, error: userError } = await admin.auth.admin.getUserById(userId);
    const email = found?.user?.email;
    if (userError || !email) return NextResponse.json({ error: "expired" }, { status: 400, headers: NO_STORE });

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) throw linkError ?? new Error("magic link without a token");

    const auth = createSupabaseClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: verified, error: verifyError } = await auth.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
    const session = verified?.session;
    if (verifyError || !session?.refresh_token) throw verifyError ?? new Error("verified without a session");

    return NextResponse.json(
      { refresh_token: session.refresh_token, user_id: userId, email },
      { headers: NO_STORE },
    );
  } catch (e) {
    console.error("t2qcal handoff redeem failed", e);
    captureError(e, { route: "/api/t2qcal/handoff/redeem" });
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
