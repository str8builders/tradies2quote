import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { collectStatusSummary, isAuthorizedStatus } from "@/lib/status-summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/status/summary — machine-readable health for an external
 * dashboard (STR8 Hub). Bearer `T2Q_STATUS_TOKEN` only; 404 when the token
 * is not configured so the route is invisible on deployments without it.
 */
export async function GET(request: Request) {
  if (!process.env.T2Q_STATUS_TOKEN) return new NextResponse(null, { status: 404 });
  if (!isAuthorizedStatus(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  try {
    const summary = await collectStatusSummary(adminClient());
    return NextResponse.json(summary, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("[status/summary]", e);
    captureError(e, { route: "status/summary" });
    return NextResponse.json({ ok: false, error: "summary_failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
