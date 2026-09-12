import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";
import { OWNER_EMAIL } from "@/lib/owner";
import { collectErrorDigest } from "@/lib/digest/errorsCollect";
import { buildErrorDigest } from "@/lib/digest/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RESEND_URL = "https://api.resend.com/emails";

/**
 * GET/POST /api/cron/error-digest
 *
 * The morning triage that deflects support before it exists: every morning,
 * the last 24h of the internal error monitor — server errors, browser
 * errors, and the calculator app's crash reports — grouped, ranked by how
 * many times each hit, with an AI-drafted diagnosis for the top few, in one
 * email to the owner. The user whose app crashed never has to write in for
 * the fix to start.
 *
 * Same CRON_SECRET auth and soft posture as the other crons: a missing
 * Resend config or a quiet night returns ok with a reason, never throws.
 * A quiet night also sends NO email — "nothing broke" every day trains the
 * owner to ignore the one morning that matters.
 *
 * `?days=N` (1–31, default 1) widens the window — for catching up after a
 * holiday, or for testing against a month of history.
 */
export async function POST(request: NextRequest) {
  return handle(request);
}

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

  const daysRaw = Number(request.nextUrl.searchParams.get("days"));
  const windowDays = Number.isFinite(daysRaw)
    ? Math.min(31, Math.max(1, Math.trunc(daysRaw)))
    : 1;

  try {
    const admin = adminClient();
    const data = await collectErrorDigest(admin, { windowDays, ...(dryRun ? { diagnose: async () => [] } : {}) });

    if (data.groups.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: "no_errors",
        windowDays,
      });
    }

    const rendered = buildErrorDigest(data);

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
        events: data.totalEvents,
        problems: data.groups.length,
        diagnosed: data.diagnoses.length,
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
      console.error("[error-digest] Resend error", res.status, detail);
      return NextResponse.json(
        { ok: false, error: `email_send_failed_${res.status}` },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      subject: rendered.subject,
      events: data.totalEvents,
      problems: data.groups.length,
      diagnosed: data.diagnoses.length,
      windowDays,
    });
  } catch (err) {
    console.error("[error-digest] failed", err);
    captureError(err, { route: "/api/cron/error-digest" });
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
