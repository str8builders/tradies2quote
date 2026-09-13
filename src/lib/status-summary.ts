import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getBuildIdentity } from "@/lib/health-checks";

/**
 * Machine-readable status for an external dashboard (STR8 Hub polls it).
 *
 * Read-only aggregate over the agent monitor (`agent_runs`), the internal
 * error sink (`app_error_groups` / `app_error_events`), quotes and client
 * requests. No user data, no secrets — counts, names of agents and routes,
 * and the last failure message (already scrubbed by the logger).
 */
export type StatusSummary = {
  ok: boolean;
  generatedAt: string;
  build: { commit: string | null; env: string };
  windowHours: number;
  agents: {
    runs: number;
    completed: number;
    failed: number;
    byAgent: { name: string; runs: number; failed: number; lastRunAt: string | null }[];
    lastFailure: { agent: string; at: string; message: string | null } | null;
  };
  errors: { groupsActive: number; events: number; topRoutes: { route: string; count: number }[] };
  quotes: { created: number; created7d: number; byStatus: Record<string, number> };
  requests: { open: number; received: number };
  warnings: string[];
};

/** Constant-time bearer check against T2Q_STATUS_TOKEN (same shape as cron auth). */
export function isAuthorizedStatus(authHeader: string | null, token = process.env.T2Q_STATUS_TOKEN): boolean {
  if (!token || token.length < 16 || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${token}`);
  const actual = Buffer.from(authHeader);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

type Db = Pick<SupabaseClient, "from">;

const COMPLETE = new Set(["complete", "completed", "succeeded", "done", "ok"]);

export async function collectStatusSummary(db: Db, now = new Date(), windowHours = 24): Promise<StatusSummary> {
  const since = new Date(now.getTime() - windowHours * 3_600_000).toISOString();
  const since7d = new Date(now.getTime() - 7 * 24 * 3_600_000).toISOString();
  const warnings: string[] = [];
  const build = getBuildIdentity();

  const [runsRes, groupsRes, eventsRes, quotesRes, quotes7dRes, requestsOpenRes, requestsNewRes] = await Promise.all([
    db.from("agent_runs").select("agent_name, status, started_at, error_message, last_message").gte("started_at", since).order("started_at", { ascending: false }).limit(2000),
    db.from("app_error_groups").select("route, event_count, last_seen_at, status").gte("last_seen_at", since).order("last_seen_at", { ascending: false }).limit(500),
    db.from("app_error_events").select("id", { count: "exact", head: true }).gte("occurred_at", since),
    db.from("quotes").select("status").gte("created_at", since).limit(5000),
    db.from("quotes").select("id", { count: "exact", head: true }).gte("created_at", since7d),
    db.from("quote_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
    db.from("quote_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  for (const [label, res] of [["agent_runs", runsRes], ["app_error_groups", groupsRes], ["app_error_events", eventsRes], ["quotes", quotesRes], ["quotes_7d", quotes7dRes], ["quote_requests_open", requestsOpenRes], ["quote_requests_new", requestsNewRes]] as const) {
    if (res.error) warnings.push(`${label}: ${res.error.message}`);
  }

  type Run = { agent_name: string | null; status: string | null; started_at: string | null; error_message: string | null; last_message: string | null };
  const runs = (runsRes.data ?? []) as Run[];
  const byAgent = new Map<string, { runs: number; failed: number; lastRunAt: string | null }>();
  let completed = 0, failed = 0;
  let lastFailure: StatusSummary["agents"]["lastFailure"] = null;
  for (const r of runs) {
    const name = r.agent_name ?? "unknown";
    const entry = byAgent.get(name) ?? { runs: 0, failed: 0, lastRunAt: null };
    entry.runs += 1;
    if (!entry.lastRunAt || (r.started_at && r.started_at > entry.lastRunAt)) entry.lastRunAt = r.started_at;
    const status = (r.status ?? "").toLowerCase();
    if (COMPLETE.has(status)) completed += 1;
    else if (status === "failed" || status === "error") {
      failed += 1; entry.failed += 1;
      if (!lastFailure || (r.started_at && r.started_at > lastFailure.at)) {
        lastFailure = { agent: name, at: r.started_at ?? "", message: r.error_message ?? r.last_message ?? null };
      }
    }
    byAgent.set(name, entry);
  }

  type Group = { route: string | null; event_count: number | null; status: string | null };
  const groups = (groupsRes.data ?? []) as Group[];
  const routeCounts = new Map<string, number>();
  for (const g of groups) {
    const route = g.route ?? "(unknown)";
    routeCounts.set(route, (routeCounts.get(route) ?? 0) + (g.event_count ?? 0));
  }
  const topRoutes = [...routeCounts.entries()].map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count).slice(0, 5);

  const byStatus: Record<string, number> = {};
  for (const q of (quotesRes.data ?? []) as { status: string | null }[]) {
    const s = q.status ?? "unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  return {
    ok: warnings.length === 0,
    generatedAt: now.toISOString(),
    build: { commit: build.commitSha ? build.commitSha.slice(0, 10) : null, env: build.vercelEnv ?? build.nodeEnv },
    windowHours,
    agents: {
      runs: runs.length, completed, failed,
      byAgent: [...byAgent.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.runs - a.runs),
      lastFailure,
    },
    errors: { groupsActive: groups.filter((g) => g.status !== "resolved").length, events: eventsRes.count ?? 0, topRoutes },
    quotes: { created: (quotesRes.data ?? []).length, created7d: quotes7dRes.count ?? 0, byStatus },
    requests: { open: requestsOpenRes.count ?? 0, received: requestsNewRes.count ?? 0 },
    warnings,
  };
}
