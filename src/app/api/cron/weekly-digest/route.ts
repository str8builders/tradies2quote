import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";
import { OWNER_EMAIL } from "@/lib/owner";
import { collectWeeklyDigest } from "@/lib/digest/collect";
import { buildWeeklyDigest } from "@/lib/digest/weekly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESEND_URL = "https://api.resend.com/emails";

/**
 * GET/POST /api/cron/weekly-digest
 *
 * Once-a-week "your AI is learning" email to the owner. Reads ONLY existing
 * tables (tradie_memories + agent_events), renders the digest, and sends it via
 * Resend. Zero new schema, zero paid model calls, zero manual labour — the
 * flywheel already captures on every quote save; this just makes it visible.
 *
 * Same CRON_SECRET auth as the trial-emails cron. Soft everywhere: a missing
 * Resend config or an empty week returns ok with a reason, never throws.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}

// Vercel Cron sends GET; accept both so it's curl-pokeable for testing.
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "cron_not_configured", message: "Set CRON_SECRET." },
      { status: 503 },
    );
  }
  const authHeader = request.headers.get("authorization");
  if (!isAuthorizedCron(authHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "1";

  try {
    const admin = adminClient();
    const data = await collectWeeklyDigest(admin);
    const rendered = buildWeeklyDigest(data);

    if (dryRun) return NextResponse.json({ ok: true, dryRun: true, sent: false });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      // Still report what WOULD have been sent so the run is observable.
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "email_not_configured",
        subject: rendered.subject,
        learnedThisWeek: data.memoriesNewThisWeek,
        memoriesTotal: data.memoriesTotal,
      });
    }

    const res = await fetchWithTimeout(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [OWNER_EMAIL],
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      }),
    }, TIMEOUTS.email);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[weekly-digest] Resend error", res.status, detail);
      return NextResponse.json(
        { ok: false, error: `email_send_failed_${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      subject: rendered.subject,
      learnedThisWeek: data.memoriesNewThisWeek,
      memoriesTotal: data.memoriesTotal,
      agents: data.agentStats.length,
    });
  } catch (err) {
    console.error("[weekly-digest] failed", err);
    captureError(err, { route: "/api/cron/weekly-digest" });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
