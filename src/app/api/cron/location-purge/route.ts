import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily: delete route points older than 90 days, and clear pins older than
 * 90 days unless their hours are on a live invoice
 * (public.purge_location_history). CRON_SECRET, like the other jobs.
 */
export async function POST(request: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 });
  if (!isAuthorizedCron(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (request.nextUrl.searchParams.get("dry_run") === "1") return NextResponse.json({ ok: true, dryRun: true, failed: 0 });
  try {
    const { data, error } = await adminClient().rpc("purge_location_history");
    if (error) throw error;
    return NextResponse.json({ ok: true, failed: 0, removed: data });
  } catch (error) {
    captureError(error, { route: "api/cron/location-purge" });
    return NextResponse.json({ ok: false, failed: 1 }, { status: 500 });
  }
}
