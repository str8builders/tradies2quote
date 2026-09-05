import { NextResponse } from "next/server";
import { getBuildIdentity } from "@/lib/health-checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — uptime-monitor endpoint.
 *
 * Deliberately MINIMAL and dependency-free: a 200 means the Next.js
 * serverless runtime is up and serving this deployment. No DB or provider
 * pings — an uptime probe must be cheap, fast, and never flap because a
 * third party blinked (deep service checks live on the owner-only
 * /app/debug page via getAllHealthChecks). No secrets, no user data —
 * just the build identity so an incident can be tied to a deploy.
 */
export async function GET() {
  const build = getBuildIdentity();
  return NextResponse.json(
    {
      ok: true,
      commit: build.commitSha ? build.commitSha.slice(0, 10) : null,
      env: build.vercelEnv ?? build.nodeEnv,
      time: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { "cache-control": "no-store" },
    },
  );
}
