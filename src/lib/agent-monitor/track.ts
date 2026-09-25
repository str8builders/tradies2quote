import "server-only";

// Import through the alias, never "./logger": vitest maps this specifier to
// the no-op stub, so tests can't write real agent_runs rows.
import {
  flushAgentRun,
  logAgentRunFinish,
  logAgentRunStart,
  newRunId,
} from "@/lib/agent-monitor/logger";
import { describeAiError } from "@/lib/ai/errors";

/**
 * One `agent_runs` row for an agent that doesn't go through the shared
 * runtime (drawing scan, supplier-quote reader, plan reader): run.start now,
 * run.finish once. Failure-safe like the logger it wraps — never throws, and
 * `finish` waits for the queued writes so a route can answer right after.
 *
 * Messages are operator-only summaries: counts, token usage and the typed
 * error — never the image, the transcript or anything read off a document.
 */
export interface TrackedAgentRun {
  readonly runId: string;
  succeed(message: string): Promise<void>;
  fail(error: unknown, context?: string): Promise<void>;
}

export function trackAgentRun(
  agentName: string,
  opts: {
    runIdPrefix: string;
    quoteId?: string;
    userId?: string;
    startMessage?: string;
  },
): TrackedAgentRun {
  const runId = newRunId(opts.runIdPrefix);
  const startedAt = Date.now();
  let done = false;
  logAgentRunStart({
    agentName,
    runId,
    stepName: "run.start",
    status: "running",
    message: opts.startMessage,
    quoteId: opts.quoteId,
    userId: opts.userId,
  });

  const finish = async (status: "complete" | "failed", message: string) => {
    if (done) return;
    done = true;
    logAgentRunFinish({
      agentName,
      runId,
      stepName: "run.finish",
      status,
      message: message.slice(0, 240),
      quoteId: opts.quoteId,
      durationMs: Date.now() - startedAt,
    });
    await flushAgentRun(runId);
  };

  return {
    runId,
    succeed: (message) => finish("complete", message),
    fail: (error, context) =>
      finish(
        "failed",
        `${context ? `${context}: ` : ""}${describeAiError(error)}`,
      ),
  };
}

/** "2 attempts · 1200 in / 340 out tok · cache 900 read" for a run message. */
export function usageSummary(
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
  },
  attempts?: number,
): string {
  const parts: string[] = [];
  if (attempts !== undefined) parts.push(`${attempts} attempt${attempts === 1 ? "" : "s"}`);
  parts.push(`${usage.inputTokens} in / ${usage.outputTokens} out tok`);
  if (usage.cacheReadTokens !== undefined) parts.push(`cache ${usage.cacheReadTokens} read`);
  return parts.join(" · ");
}
