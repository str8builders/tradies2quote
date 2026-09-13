import { describe, expect, it } from "vitest";
import { collectStatusSummary, isAuthorizedStatus } from "./status-summary";

const TOKEN = "status-token-".repeat(3);

describe("isAuthorizedStatus", () => {
  it("accepts only the exact bearer token", () => {
    expect(isAuthorizedStatus(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
    expect(isAuthorizedStatus(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(isAuthorizedStatus(`bearer ${TOKEN}`, TOKEN)).toBe(false);
    expect(isAuthorizedStatus(null, TOKEN)).toBe(false);
    expect(isAuthorizedStatus(`Bearer short`, "short")).toBe(false);
    expect(isAuthorizedStatus(`Bearer ${TOKEN}`, undefined)).toBe(false);
  });
});

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      let head = false;
      const chain = {
        select(_cols: string, opts?: { count?: string; head?: boolean }) { head = Boolean(opts?.head); return chain; },
        gte() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; },
        then(resolve: (v: unknown) => void) {
          if (failing.includes(table)) return resolve({ data: null, count: null, error: { message: `${table} down` } });
          return resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, count: rows.length, error: null });
        },
      };
      return chain;
    },
  } as unknown as Parameters<typeof collectStatusSummary>[0];
}

describe("collectStatusSummary", () => {
  const now = new Date("2026-09-13T10:00:00Z");
  it("aggregates agent runs, error groups, quotes and requests", async () => {
    const db = fakeDb({
      agent_runs: [
        { agent_name: "Follow-up Agent", status: "complete", started_at: "2026-09-13T09:00:00Z", error_message: null, last_message: "ok" },
        { agent_name: "Follow-up Agent", status: "complete", started_at: "2026-09-13T08:00:00Z", error_message: null, last_message: "ok" },
        { agent_name: "Quote Critic", status: "failed", started_at: "2026-09-13T07:00:00Z", error_message: "provider timeout", last_message: null },
      ],
      app_error_groups: [
        { route: "/app", event_count: 12, last_seen_at: "2026-09-13T08:58:00Z", status: "open" },
        { route: "stripe/webhook", event_count: 1, last_seen_at: "2026-09-12T22:32:00Z", status: "resolved" },
      ],
      app_error_events: [{}, {}, {}],
      quotes: [{ status: "draft" }, { status: "sent" }, { status: "draft" }],
      quote_requests: [{ status: "new" }],
    });
    const s = await collectStatusSummary(db, now);
    expect(s.ok).toBe(true);
    expect(s.agents).toMatchObject({ runs: 3, completed: 2, failed: 1 });
    expect(s.agents.byAgent[0]).toMatchObject({ name: "Follow-up Agent", runs: 2, failed: 0, lastRunAt: "2026-09-13T09:00:00Z" });
    expect(s.agents.lastFailure).toEqual({ agent: "Quote Critic", at: "2026-09-13T07:00:00Z", message: "provider timeout" });
    expect(s.errors).toEqual({ groupsActive: 1, events: 3, topRoutes: [{ route: "/app", count: 12 }, { route: "stripe/webhook", count: 1 }] });
    expect(s.quotes).toEqual({ created: 3, created7d: 3, byStatus: { draft: 2, sent: 1 } });
    expect(s.requests).toEqual({ open: 1, received: 1 });
    expect(s.generatedAt).toBe(now.toISOString());
  });
  it("reports a failing table as a warning instead of throwing", async () => {
    const s = await collectStatusSummary(fakeDb({}, ["agent_runs"]), now);
    expect(s.ok).toBe(false);
    expect(s.warnings).toEqual(["agent_runs: agent_runs down"]);
    expect(s.agents.runs).toBe(0);
  });
});
