import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/owner";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import {
  isLocalTextAiProvider,
  resolveLocalLlmConfig,
  runLocalChatCompletion,
} from "@/lib/llm/local-chat";

/**
 * Owner-only triage endpoint for failed (or any) agent run.
 *
 * POST /api/agents/diagnose
 *   body: { run_id: string }
 *   returns: { ok: true, diagnosis: string } | { error, message }
 *
 * Flow:
 *   1. Auth gate — only the project owner can call this.
 *   2. Read the run row + the last 20 events for that run.
 *   3. Send the lot to the configured local text model with a triage prompt.
 *   4. Return the model's markdown analysis — probable cause, suggested
 *      fix, what to check, retry suitability.
 *
 * No mutations. The user reads the analysis and decides what to do.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1800;

const SYSTEM_PROMPT = `You are a senior on-call engineer triaging a failed agent run in a Next.js + Supabase quoting app for tradespeople (tradies2Quote).

You'll receive:
- The summary row of one run (agent name, status, last step, last message, error message, started/finished times)
- The last 20 events tied to that run (chronological)

Produce a tight triage report in markdown with these sections, each one or two sentences max:

**Probable cause** — your best guess at what went wrong.
**Likely fix** — concrete next step (code change, env var, retry, etc.).
**What to check** — one log file, one DB query, one URL, or one env var to verify.
**Safe to retry?** — yes / no / yes with caveat.

Rules:
- No fluff, no preamble, no \"I think\" — state the diagnosis directly.
- If the data is too sparse to be confident, say so in one line and stop.
- Never invent file paths, error codes, or env var names you don't see in the data.`;

interface DiagnoseBody {
  run_id?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isOwnerEmail(user.email)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Defence-in-depth: owner-only already, but a leaked session/XSS
  // shouldn't be able to burn unbounded LLM credit either.
  const quota = consumeDailyQuota("diagnose:" + user.id, 200);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  try {
    if (!isLocalTextAiProvider()) throw new Error("local provider not selected");
    resolveLocalLlmConfig();
  } catch {
    return NextResponse.json(
      {
        error: "ai_not_configured",
        message: "Local AI diagnosis is not configured.",
      },
      { status: 503 },
    );
  }

  let body: DiagnoseBody;
  try {
    body = (await request.json()) as DiagnoseBody;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Body must be JSON with a run_id." },
      { status: 400 },
    );
  }
  const runId = typeof body.run_id === "string" ? body.run_id.trim() : "";
  if (!runId) {
    return NextResponse.json(
      { error: "bad_request", message: "run_id is required." },
      { status: 400 },
    );
  }

  const admin = adminClient();
  const [runRes, eventsRes] = await Promise.all([
    admin
      .from("agent_runs")
      .select(
        "run_id, agent_name, status, started_at, finished_at, duration_ms, last_step, last_message, error_message, approval_required, quote_id",
      )
      .eq("run_id", runId)
      .maybeSingle(),
    admin
      .from("agent_events")
      .select(
        "event_type, status, step, message, created_at",
      )
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  if (runRes.error) {
    return NextResponse.json(
      { error: "db_error", message: runRes.error.message },
      { status: 500 },
    );
  }
  const run = runRes.data;
  if (!run) {
    return NextResponse.json(
      { error: "not_found", message: `No run with id ${runId}.` },
      { status: 404 },
    );
  }
  const events = eventsRes.data ?? [];

  // Build the user-facing payload the model reads. Plain JSON so the model
  // can pattern-match on field names without us pre-summarizing.
  const payload = {
    run: {
      agent_name: run.agent_name,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      duration_ms: run.duration_ms,
      last_step: run.last_step,
      last_message: run.last_message,
      error_message: run.error_message,
      approval_required: run.approval_required,
      quote_id: run.quote_id,
    },
    events,
  };

  let modelResult: Awaited<ReturnType<typeof runLocalChatCompletion>>;
  try {
    modelResult = await runLocalChatCompletion({
      system: SYSTEM_PROMPT,
      user: `Here is the run + recent events as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nProduce the triage report.`,
      maxTokens: 800,
      temperature: 0,
    });
  } catch (error) {
    console.error("Local Qwen diagnose call failed", error);
    captureError(error, { route: "/api/agents/diagnose" });
    return NextResponse.json(
      {
        error: "ai_error",
        message: "The local AI couldn't analyze the run. Try again in a moment.",
      },
      { status: 502 },
    );
  }
  const diagnosis = modelResult.text.trim();

  if (!diagnosis) {
    return NextResponse.json(
      {
        error: "empty_response",
        message: "The local AI returned no analysis.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, diagnosis });
}
