import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { adminClient } from "@/lib/supabase/admin";
import { purgeAccount } from "@/lib/account-deletion";
import { captureError } from "@/lib/observability";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const db = adminClient();
    if (request.nextUrl.searchParams.get("dry_run") === "1") {
      const { count, error } = await db.from("account_deletion_requests" as never).select("user_id", { count: "exact", head: true });
      if (error) throw error;
      return NextResponse.json({ ok: true, dryRun: true, pending: count ?? 0, processed: 0, failed: 0 });
    }
    const { data, error } = await db.rpc("claim_account_deletions" as never, { p_limit: 5 } as never);
    if (error) throw error;
    const rows = (data ?? []) as { user_id: string }[];
    const deadline = Date.now() + 240_000;
    let processed = 0, failed = 0;
    for (const row of rows) {
      if (Date.now() >= deadline) break;
      const result = await purgeAccount(row.user_id);
      if (result.ok) processed++; else failed++;
    }
    if (failed) captureError(new Error("Account deletion requires another retry"), { route: "cron/account-deletions" });
    return NextResponse.json({ ok: failed === 0, processed, failed, deferred: rows.length - processed - failed }, { status: failed ? 503 : 200 });
  } catch {
    captureError(new Error("Pending account deletion batch failed"), { route: "cron/account-deletions" });
    return NextResponse.json({ ok: false, error: "deletion_batch_failed" }, { status: 503 });
  }
}
