import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isOwnerEmail } from "@/lib/owner";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

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
 *   3. Ship the lot to Claude with a triage prompt.
 *   4. Return the model's markdown analysis — probable cause, suggested
 *      fix, what to check, retry suitability.
 *
 * No mutations. The user reads the analysis and decides what to do.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "ai_not_configured",
        message: "Diagnose needs ANTHROPIC_API_KEY in the environment.",
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

  // Build the user-facing payload Claude reads. Plain JSON so the model
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

  const claudeRes = await fetchWithTimeout(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      // Sonnet 5's tokenizer emits ~30% more tokens for the same content;
      // 600 risked clipping the triage report.
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the run + recent events as JSON:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nProduce the triage report.`,
        },
      ],
    }),
  }, TIMEOUTS.llm);

  if (!claudeRes.ok) {
    const detail = await claudeRes.text().catch(() => "");
    console.error("Claude diagnose call failed", claudeRes.status, detail);
    captureError(new Error(`Claude diagnose ${claudeRes.status}: ${detail.slice(0, 120)}`), { route: "/api/agents/diagnose" });
    return NextResponse.json(
      {
        error: `ai_error_${claudeRes.status}`,
        message: "Claude couldn't analyze the run. Try again in a moment.",
      },
      { status: 502 },
    );
  }

  let data: { content?: Array<{ type: string; text?: string }> };
  try {
    data = (await claudeRes.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
  } catch {
    // A non-JSON 200 (CDN/proxy error page) would otherwise throw → raw 500.
    return NextResponse.json(
      {
        error: "ai_parse_error",
        message: "Claude returned an unexpected response. Try again.",
      },
      { status: 502 },
    );
  }
  // Claude returns content as an array of blocks; only the text ones matter.
  const diagnosis =
    data.content
      ?.filter((c) => c.type === "text" && typeof c.text === "string")
      .map((c) => c.text)
      .join("\n\n")
      .trim() ?? "";

  if (!diagnosis) {
    return NextResponse.json(
      {
        error: "empty_response",
        message: "Claude returned no analysis.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, diagnosis });
}
