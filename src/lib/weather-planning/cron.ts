// ── Weather planning — scheduled sweep ─────────────────────────────────────
// Shared by the three cron routes (evening / morning / pre-job). Selects
// scheduled quotes whose start falls in a time window and runs the SAME
// assessJob orchestrator used on-demand, so cron and manual paths are identical.
//
// Safety: the engine gates the LLMs (only non-low jobs call Pat/Willa), so most
// jobs are pure/fast. We still cap the batch and keep a wall-clock budget so the
// run finishes inside Vercel's 60s cron limit; anything left is picked up next
// run. Customer messages are NEVER sent here — Willa only writes drafts.

import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { captureError } from "@/lib/observability";
import { describeAiError } from "@/lib/ai/errors";
import { assessJob, type TriggerSource } from "./assess";

export interface SweepArgs {
  triggerSource: TriggerSource;
  /** Inclusive lower / exclusive upper bound on quotes.scheduled_for (ISO). */
  fromISO: string;
  toISO: string;
  now: string;
  maxJobs?: number;
  /** Stop starting new jobs after this many ms (default 50s — under the 60s cap). */
  timeBudgetMs?: number;
}

export interface SweepResult {
  scanned: number;
  assessed: number;
  skipped: number;
  errors: number;
  byReason: Record<string, number>;
  truncated: boolean;
}

export async function runWeatherSweep(args: SweepArgs): Promise<SweepResult> {
  const db = adminClient();
  const maxJobs = args.maxJobs ?? 50;
  const budget = args.timeBudgetMs ?? 50_000;
  const startedAt = Date.parse(args.now);

  const { data: jobs } = await db
    .from("quotes")
    .select("id, user_id, scheduled_for")
    .eq("status", "scheduled")
    .gte("scheduled_for", args.fromISO)
    .lt("scheduled_for", args.toISO)
    .order("scheduled_for", { ascending: true })
    .limit(maxJobs);

  const result: SweepResult = { scanned: jobs?.length ?? 0, assessed: 0, skipped: 0, errors: 0, byReason: {}, truncated: false };
  if (!jobs?.length) return result;

  for (const job of jobs) {
    // Wall-clock guard: leave the remainder for the next scheduled run.
    if (Date.now() - startedAt > budget) {
      result.truncated = true;
      break;
    }
    try {
      const r = await assessJob({
        quoteId: job.id,
        userId: job.user_id,
        triggerSource: args.triggerSource,
        now: args.now,
      });
      if (r.status === "assessed") result.assessed += 1;
      else {
        result.skipped += 1;
        result.byReason[r.reason] = (result.byReason[r.reason] ?? 0) + 1;
      }
    } catch (err) {
      result.errors += 1;
      console.error("weather sweep job failed", job.id, describeAiError(err));
      captureError(err, { route: `weather-planning/cron:${args.triggerSource}` });
    }
  }
  return result;
}

/** Window helpers (UTC day math; v1 keeps it simple — see docs). */
export function windowsForNow(nowISO: string) {
  const now = Date.parse(nowISO);
  const H = 60 * 60 * 1000;
  return {
    // Evening: tomorrow's jobs (next ~12–36h out).
    evening: { fromISO: new Date(now + 12 * H).toISOString(), toISO: new Date(now + 36 * H).toISOString() },
    // Morning: today's jobs (now → next 18h).
    morning: { fromISO: new Date(now).toISOString(), toISO: new Date(now + 18 * H).toISOString() },
    // Pre-job: jobs starting within ~3h.
    prejob: { fromISO: new Date(now).toISOString(), toISO: new Date(now + 3 * H).toISOString() },
  };
}
