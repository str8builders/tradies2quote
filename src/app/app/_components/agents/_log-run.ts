"use server";

import {
  flushAgentRun,
  logAgentRunStart,
  logAgentRunFinish,
} from "@/lib/agent-monitor/logger";
import { createClient } from "@/lib/supabase/server";
import { consumeFixedWindow } from "@/lib/rate-limit";

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
  // Audit 2026-09-15: a server action is a public POST. Only signed-in users
  // may write monitoring rows (through the service role), and not in a loop.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (!consumeFixedWindow(`agent-beacon:${user.id}`, 60, 15 * 60_000).ok) return;
  const agentName = String(input.agentName).slice(0, 80);
  const message = String(input.message).slice(0, 500);
  input = { agentName, message, ok: input.ok === true };
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
