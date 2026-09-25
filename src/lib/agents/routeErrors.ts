import "server-only";

import { NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { flushAgentRun, logAgentRunFinish } from "@/lib/agent-monitor/logger";
import {
  aiErrorResponse,
  describeAiError,
  type AiErrorKind,
} from "@/lib/ai/errors";

/**
 * The one way an /api/agents/* route answers when its agent throws.
 *
 * The detail (typed kind, upstream status, provider error type) goes to the
 * server log, the internal error monitor and the operator-only agent monitor.
 * The client only ever gets a plain sentence and a machine-readable `code` —
 * never `Anthropic 529: {...}` or any other upstream text.
 *
 * Closes the run row the route minted: a no-op update when the shared
 * runtime already closed it, the only close when the agent threw before the
 * runtime opened it.
 */
export async function agentFailureResponse(
  err: unknown,
  ctx: {
    route: string;
    agentName: string;
    runId: string;
    startedAt: number;
    /** Plain sentence for errors that are not AiErrors. */
    fallbackMessage?: string;
    /** Feature-specific phrasing per kind (e.g. "Reading the photo…"). */
    messages?: Partial<Record<AiErrorKind, string>>;
  },
): Promise<NextResponse> {
  const detail = describeAiError(err);
  console.error(`${ctx.route} failed: ${detail}`);
  captureError(err, { route: ctx.route });
  logAgentRunFinish({
    agentName: ctx.agentName,
    runId: ctx.runId,
    stepName: "run.finish",
    status: "failed",
    message: `Failed: ${detail}`,
    durationMs: Date.now() - ctx.startedAt,
  });
  await flushAgentRun(ctx.runId);

  const { status, body, retryAfterSeconds } = aiErrorResponse(err, {
    fallbackMessage: ctx.fallbackMessage,
    messages: ctx.messages,
  });
  return NextResponse.json(body, {
    status,
    headers: retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : undefined,
  });
}
