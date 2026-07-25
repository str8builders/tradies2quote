// Cron: PRE-JOB check — assess jobs starting within the next ~3h so the tradie
// gets a final read close to start time. Scheduled by systemd timers on the VPS (tradies2quote-cron@<name>.timer). Gated by
// CRON_SECRET + the weather-planning flag. Willa drafts only — nothing is sent.
import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { isWeatherPlanningEnabled } from "@/lib/weather-planning/flag";
import { runWeatherSweep, windowsForNow } from "@/lib/weather-planning/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "cron_not_configured", message: "Set CRON_SECRET." }, { status: 503 });
  }
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isWeatherPlanningEnabled()) {
    return NextResponse.json({ ok: true, skipped: "weather_planning_disabled" });
  }
  const now = new Date().toISOString();
  const w = windowsForNow(now).prejob;
  const result = await runWeatherSweep({ triggerSource: "prejob", fromISO: w.fromISO, toISO: w.toISO, now });
  return NextResponse.json({ ok: true, source: "prejob", ...result });
}
