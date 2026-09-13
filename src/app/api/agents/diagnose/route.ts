import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/owner";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import {
  resolveLocalLlmConfig,
  runLocalChatCompletion,
} from "@/lib/llm/local-chat";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { runStructuredAgent } from "@/lib/agents/runtime";

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
 *   3. Send the lot to the configured text model with a triage prompt —
 *      the local OpenAI-compatible endpoint when TEXT_AI_PROVIDER=local,
 *      otherwise hosted Claude through the shared agent runtime. (Until
 *      Wave 41 this required the local provider and 503'd in production,
 *      where TEXT_AI_PROVIDER=anthropic — the dashboard's Diagnose button
 *      was simply dead.)
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

/** Output cap for the triage report. At/below `SMALL_CAP_TOKENS` the shared
 *  runtime adds `output_config: { effort: "low" }`, so a thinking model can't
 *  spend the whole cap reasoning and return nothing. */
const DIAGNOSE_MAX_TOKENS = 1024;

/** Forced-tool shape for the hosted path — markdown in one string field. */
const DIAGNOSE_TOOL = {
  name: "report_diagnosis",
  description: "Return the triage report as markdown.",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["diagnosis"],
    properties: {
      diagnosis: {
        type: "string",
        description:
          "The markdown triage report, with the four required sections.",
      },
    },
  },
};

function parseDiagnosis(input: unknown):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const text = (input as { diagnosis?: unknown } | null)?.diagnosis;
  if (typeof text !== "string" || !text.trim()) {
    return { ok: false, error: "diagnosis must be a non-empty string" };
  }
  return { ok: true, value: text.trim() };
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

  const provider = resolveQuoteTextProvider();
  try {
    if (!provider) throw new Error("no text provider configured");
    if (provider === "local") resolveLocalLlmConfig();
  } catch {
    return NextResponse.json(
      {
        error: "ai_not_configured",
        message: "AI diagnosis is not configured.",
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

  const userPrompt = `Here is the run + recent events as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nProduce the triage report.`;

  let diagnosis = "";
  try {
    if (provider === "local") {
      const modelResult = await runLocalChatCompletion({
        system: SYSTEM_PROMPT,
        user: userPrompt,
        maxTokens: DIAGNOSE_MAX_TOKENS,
        temperature: 0,
      });
      diagnosis = modelResult.text.trim();
    } else {
      // Hosted Claude through the shared runtime: forced structured output,
      // prompt caching on the system block, and the monitor logging every
      // other agent gets. Diagnosing a run is itself a run.
      const agentResult = await runStructuredAgent<string>({
        agentName: "Run Diagnosis",
        system: SYSTEM_PROMPT,
        user: userPrompt,
        tool: DIAGNOSE_TOOL,
        parse: parseDiagnosis,
        maxTokens: DIAGNOSE_MAX_TOKENS,
        userId: user.id,
      });
      diagnosis = agentResult.value.trim();
    }
  } catch (error) {
    console.error(`Diagnose call failed (${provider})`, error);
    captureError(error, { route: "/api/agents/diagnose" });
    return NextResponse.json(
      {
        error: "ai_error",
        message: "The AI couldn't analyze the run. Try again in a moment.",
      },
      { status: 502 },
    );
  }

  if (!diagnosis) {
    return NextResponse.json(
      {
        error: "empty_response",
        message: "The AI returned no analysis.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, diagnosis });
}
