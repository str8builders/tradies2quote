import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import {
  runMaterialsTakeoffAgent,
  type MaterialsTakeoffInput,
} from "@/lib/agents/materials-takeoff";
import {
  logAgentRunStart,
  logAgentRunFinish,
} from "@/lib/agent-monitor/logger";
import { isOwnerEmail } from "@/lib/owner";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// LLM call can take 20-40s; avoid a 502 on the default function timeout.
export const maxDuration = 1800;

/**
 * POST /api/agents/materials-takeoff
 *
 * Body: { jobText: string, country?: "NZ" | "AU" | "UK" | "US" | "CA" }
 * Returns: { understoodAs, lines: [...], assumptions: [...], reviewFlags: [...] }
 *
 * Auth gated. Never writes to the database. Never claims a supplier
 * price — the user pulls real prices from their library on the quote
 * editor.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Owner-only, matching the /app/agents UI (Wave 13) — this endpoint has
  // no quota, so leaving it open lets any signup script LLM spend.
  if (!isOwnerEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Defence-in-depth: owner-only already, but a leaked session/XSS
  // shouldn't be able to burn unbounded LLM credit either.
  const quota = consumeDailyQuota("materials-takeoff:" + user.id, 200);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  let body: Partial<MaterialsTakeoffInput>;
  try {
    body = (await req.json()) as Partial<MaterialsTakeoffInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const jobText = typeof body.jobText === "string" ? body.jobText : "";
  if (jobText.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing 'jobText' field" },
      { status: 400 },
    );
  }

  const runId = `mtake_${Math.random().toString(16).slice(2, 10)}`;
  const startedAt = Date.now();
  logAgentRunStart({
    agentName: "Materials & Takeoff Agent",
    runId,
    stepName: "run.start",
    status: "running",
    message: `Reading a ${jobText.trim().length}-char job description`,
    startedAt,
  });

  try {
    const result = await runMaterialsTakeoffAgent({
      jobText,
      country: body.country ?? "NZ",
    });
    logAgentRunFinish({
      agentName: "Materials & Takeoff Agent",
      runId,
      stepName: "run.finish",
      status: "complete",
      message: "Takeoff generated",
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    captureError(err, { route: "/api/agents/materials-takeoff" });
    logAgentRunFinish({
      agentName: "Materials & Takeoff Agent",
      runId,
      stepName: "run.finish",
      status: "failed",
      message,
      durationMs: Date.now() - startedAt,
    });
    const isConfig = /not configured/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isConfig ? 503 : 502 },
    );
  }
}
