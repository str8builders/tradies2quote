"use server";

import {
  flushAgentRun,
  logAgentRunStart,
  logAgentRunFinish,
} from "@/lib/agent-monitor/logger";

/**
 * Server-action beacon for the two browser-side agents (Variation,
 * Voice Cleanup). Those agents run as pure client-side functions, so
 * they can't import the server-only logger directly — and their lib
 * files can't either. They call this server action instead.
 *
 * The actual agent work has already happened client-side by the time
 * this is called, so there's no live window to instrument — one call
 * records a complete run.start -> run.finish pair so the run still shows
 * up on the monitoring dashboard.
 *
 * Fire-and-forget: callers do not await. Never throws — the underlying
 * logger helpers swallow every error and no-op when the dashboard env
 * vars are missing.
 */
export async function logClientAgentRun(input: {
  agentName: string;
  message: string;
  ok: boolean;
}): Promise<void> {
  const runId = `cli_${Math.random().toString(16).slice(2, 10)}`;
  logAgentRunStart({
    agentName: input.agentName,
    runId,
    stepName: "run.start",
    status: "running",
    message: input.message,
  });
  logAgentRunFinish({
    agentName: input.agentName,
    runId,
    stepName: "run.finish",
    status: input.ok ? "complete" : "failed",
    message: input.message,
  });
  // Both writes are queued in order; wait for them so the action's
  // response never races the run.finish update.
  await flushAgentRun(runId);
}
