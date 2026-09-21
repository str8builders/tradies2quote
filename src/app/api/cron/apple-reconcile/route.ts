import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { captureError } from "@/lib/observability";
import { appleSubscriptionsReady } from "@/lib/billing/apple-config";
import { runAppleReconciliation } from "@/lib/billing/apple-reconciliation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!appleSubscriptionsReady()) return NextResponse.json({ ok: false, error: "apple_not_configured" }, { status: 503 });
  try {
    const result = await runAppleReconciliation(request.nextUrl.searchParams.get("dry_run") === "1");
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch {
    captureError(new Error("Apple recovery batch failed"), { route: "cron/apple-reconcile" });
    return NextResponse.json({ ok: false, error: "reconciliation_failed" }, { status: 503 });
  }
}
