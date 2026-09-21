import { aiConsentGate } from "@/lib/ai-consent";
import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import {
  QUOTE_GENERATION_AGENT_NAME,
  runQuoteGenerationAgent,
  type QuoteGenerationInput,
} from "@/lib/agents/quote-generation";
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
 * POST /api/agents/quote-generation
 *
 * Body: { transcript: string, labourRate?: number, markupPct?: number }
 * Returns: { ok: true, result: GeneratedQuote }
 *
 * Auth-gated (same pattern as `src/app/api/quotes/transcribe/route.ts`).
 * Never writes to the database. Never sends quotes. The caller
 * renders the JSON for the tradie to review / paste into a draft
 * quote. Distinct from `/api/quotes/generate` (the heavy production
 * pipeline that operates on an existing draft quote row).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;
  // Owner-only, matching the /app/agents UI (Wave 13) — this endpoint has
  // no quota, so leaving it open lets any signup script LLM spend.
  if (!isOwnerEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Defence-in-depth: owner-only already, but a leaked session/XSS
  // shouldn't be able to burn unbounded LLM credit either.
  const quota = consumeDailyQuota("quote-generation:" + user.id, 200);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  let body: Partial<QuoteGenerationInput>;
  try {
    body = (await req.json()) as Partial<QuoteGenerationInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript =
    typeof body.transcript === "string" ? body.transcript : "";
  if (transcript.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing 'transcript' field" },
      { status: 400 },
    );
  }

  // ONE run id for the whole invocation. `runStructuredAgent` owns the
  // run.start/run.finish pair for it, so the route must not mint a second id
  // (that produced two `agent_runs` rows per call with two different agent
  // names). The route only closes the row when the agent throws BEFORE the
  // runtime got involved — an update on a run_id the runtime never opened
  // matches zero rows, so this can never create a duplicate.
  const runId = newRunId("qgen");
  const startedAt = Date.now();

  try {
    const result = await runQuoteGenerationAgent(
      {
        transcript,
        labourRate:
          typeof body.labourRate === "number" ? body.labourRate : undefined,
        markupPct:
          typeof body.markupPct === "number" ? body.markupPct : undefined,
        // Enables learned-memory injection when TRADIE_BRAIN_ENABLED=true.
        // No-op otherwise — the agent ignores it unless the flag is on.
        memory: { supabase, userId: user.id },
      },
      { runId },
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    captureError(err, { route: "/api/agents/quote-generation" });
    logAgentRunFinish({
      agentName: QUOTE_GENERATION_AGENT_NAME,
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
