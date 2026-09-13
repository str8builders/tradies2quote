import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import {
  MATERIALS_TAKEOFF_AGENT_NAME,
  runMaterialsTakeoffAgent,
  type MaterialsTakeoffInput,
} from "@/lib/agents/materials-takeoff";
import {
  flushAgentRun,
  logAgentRunFinish,
  newRunId,
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

  // ONE run id for the whole invocation. `runStructuredAgent` owns the
  // run.start/run.finish pair for it, so the route must not mint a second id
  // (that produced two `agent_runs` rows per call with two different agent
  // names). The route only closes the row when the agent throws BEFORE the
  // runtime got involved — an update on a run_id the runtime never opened
  // matches zero rows, so this can never create a duplicate.
  const runId = newRunId("mtake");
  const startedAt = Date.now();

  try {
    const result = await runMaterialsTakeoffAgent(
      {
        jobText,
        country: body.country ?? "NZ",
      },
      { runId },
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    captureError(err, { route: "/api/agents/materials-takeoff" });
    logAgentRunFinish({
      agentName: MATERIALS_TAKEOFF_AGENT_NAME,
      runId,
      stepName: "run.finish",
      status: "failed",
      message,
      durationMs: Date.now() - startedAt,
    });
    await flushAgentRun(runId);
    const isConfig = /not configured/i.test(message);
    return NextResponse.json(
      { error: message },
      { status: isConfig ? 503 : 502 },
    );
  }
}
