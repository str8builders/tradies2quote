import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  CUSTOMER_REPLY_AGENT_NAME,
  runCustomerReplyAgent,
  type CustomerReplyInput,
} from "@/lib/agents/customer-reply";
import { newRunId } from "@/lib/agent-monitor/logger";
import { agentFailureResponse } from "@/lib/agents/routeErrors";
import { isOwnerEmail } from "@/lib/owner";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// LLM call can take 20-40s; avoid a 502 on the default function timeout.
export const maxDuration = 1800;

/**
 * POST /api/agents/customer-reply
 *
 * Body: { customerMessage: string, quote?: {...}, businessName?: string }
 * Returns: { intent, confidence, reasoning, replyDraft }
 *
 * Auth gated. Never writes to the database. No emails are sent.
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
  const quota = consumeDailyQuota("customer-reply:" + user.id, 200);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  let body: Partial<CustomerReplyInput>;
  try {
    body = (await req.json()) as Partial<CustomerReplyInput>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const customerMessage =
    typeof body.customerMessage === "string" ? body.customerMessage : "";
  if (customerMessage.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing 'customerMessage' field" },
      { status: 400 },
    );
  }

  // ONE run id for the whole invocation: the shared runtime owns the
  // run.start/run.finish pair, so the route only closes the row when the
  // agent throws before the runtime opened it (a no-op update otherwise).
  const runId = newRunId("creply");
  const startedAt = Date.now();

  try {
    const result = await runCustomerReplyAgent(
      {
        customerMessage,
        quote: body.quote ?? null,
        businessName: body.businessName ?? null,
      },
      { runId },
    );
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    // Plain sentence + code to the client; the upstream detail stays in the
    // server log, the error monitor and the operator-only agent monitor.
    return agentFailureResponse(err, {
      route: "/api/agents/customer-reply",
      agentName: CUSTOMER_REPLY_AGENT_NAME,
      runId,
      startedAt,
      fallbackMessage: "The AI couldn't draft a reply. Please try again.",
    });
  }
}
