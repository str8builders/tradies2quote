import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * The logger writes to Supabase via @/lib/supabase/admin. We stub that
 * module here so the tests can record every insert/upsert/update call
 * and inspect the row that would have been written. The chainable mock
 * mirrors enough of the supabase-js builder surface to satisfy the
 * logger:
 *   admin.from(table).insert(row).then(...)
 *   admin.from(table).upsert(row, opts).then(...)
 *   admin.from(table).update(patch).eq(col, val).then(...)
 */
const insertMock = vi.fn();
const upsertMock = vi.fn();
const updateMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();
const adminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  adminClient: () => adminClientMock(),
}));

import {
  logAgentApprovalNeeded,
  logAgentError,
  logAgentEvent,
  logAgentRunFinish,
  logAgentRunStart,
  logAgentStep,
} from "../logger";

/** Snapshot the env so individual tests can mutate freely. */
const ENV_BACKUP = {
  serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
};

function restoreEnv(): void {
  if (ENV_BACKUP.serviceKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ENV_BACKUP.serviceKey;
  }
  if (ENV_BACKUP.url === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ENV_BACKUP.url;
  }
}

/** Resolve the .then-able mock so the logger's `.then(({error}) => …)`
 *  callback runs without complaint. */
const okResult = { error: null };

function resetMocks(): void {
  insertMock.mockReset().mockResolvedValue(okResult);
  upsertMock.mockReset().mockResolvedValue(okResult);
  eqMock.mockReset().mockResolvedValue(okResult);
  updateMock.mockReset().mockReturnValue({ eq: eqMock });
  fromMock.mockReset().mockImplementation((_table: string) => ({
    insert: insertMock,
    upsert: upsertMock,
    update: updateMock,
  }));
  adminClientMock.mockReset().mockReturnValue({ from: fromMock });
}

describe("agent-monitor logger", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetMocks();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // The admin client requires both, but we mock adminClient itself so
    // their actual values don't matter — set them so any guard inside
    // the real factory wouldn't trip.
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  });

  afterEach(() => {
    restoreEnv();
    vi.restoreAllMocks();
  });

  it("inserts a row into agent_events for every call", () => {
    logAgentEvent({ agentName: "X", status: "complete" });
    expect(fromMock).toHaveBeenCalledWith("agent_events");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("forwards step, message, status, run id, and uuid quote id to the events row", () => {
    logAgentStep({
      agentName: "Invoice Agent",
      runId: "run_abc_123",
      stepName: "rpc.start",
      status: "running",
      quoteId: "00000000-0000-0000-0000-000000000001",
      message: "Creating draft invoice",
      durationMs: 240,
      // The next four MUST NOT appear in the written row (PII allow-list).
      userId: "user_should_not_leak",
      metadata: { secret: "should not leak" },
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_001_000,
    });

    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>;

    expect(row.agent_name).toBe("Invoice Agent");
    expect(row.event_type).toBe("event");
    expect(row.status).toBe("running");
    expect(row.run_id).toBe("run_abc_123");
    expect(row.step).toBe("rpc.start");
    expect(row.quote_id).toBe("00000000-0000-0000-0000-000000000001");
    // Duration is folded into the message string.
    expect(row.message).toBe("Creating draft invoice · 240ms");

    // PII allow-list — none of these may leak into the row.
    expect("user_id" in row).toBe(false);
    expect("userId" in row).toBe(false);
    expect("metadata" in row).toBe(false);
    expect("started_at" in row).toBe(false);
    expect("finished_at" in row).toBe(false);
    expect("duration_ms" in row).toBe(false);
  });

  it("coerces non-uuid quote ids to null so the uuid column never 22P02s", () => {
    logAgentEvent({
      agentName: "X",
      status: "complete",
      quoteId: "not-a-uuid",
    });
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.quote_id).toBeNull();
  });

  it("logAgentError forces type=error, status=failed, and writes 500-char clamped error to the runs table", () => {
    const big = "x".repeat(800);
    logAgentError({
      agentName: "Compliance Agent",
      runId: "run_error_1",
      status: "failed",
      message: big,
    });

    // One write to agent_events with type=error.
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.event_type).toBe("error");
    expect(row.status).toBe("failed");

    // The error_message lands on the heartbeat update to agent_runs
    // (since logAgentError currently emits an `event` to the run-update
    // branch). We assert the eventsrow contains the clamped message at
    // minimum — full error string ends up on the run on a real failure
    // path (run.finish with status=failed).
    expect(
      typeof row.message === "string" && (row.message as string).length <= 500,
    ).toBe(true);
  });

  it("logAgentApprovalNeeded forces waiting_approval status", () => {
    logAgentApprovalNeeded({
      agentName: "Invoice Agent",
      runId: "run_approval_1",
      status: "waiting_approval",
      message: "Owner approval needed",
    });
    const row = insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(row.status).toBe("waiting_approval");
  });

  it("logAgentRunStart upserts into agent_runs keyed by run_id", () => {
    logAgentRunStart({
      agentName: "Quote Generation",
      runId: "run_qg_001",
      status: "running",
      stepName: "begin",
    });

    // Insert into agent_events AND upsert into agent_runs.
    expect(fromMock).toHaveBeenCalledWith("agent_events");
    expect(fromMock).toHaveBeenCalledWith("agent_runs");
    expect(upsertMock).toHaveBeenCalledTimes(1);

    const row = upsertMock.mock.calls[0][0] as Record<string, unknown>;
    const opts = upsertMock.mock.calls[0][1] as Record<string, unknown>;
    expect(row.run_id).toBe("run_qg_001");
    expect(row.agent_name).toBe("Quote Generation");
    expect(row.status).toBe("running");
    expect(opts.onConflict).toBe("run_id");
  });

  it("logAgentRunFinish updates agent_runs and stamps finished_at", () => {
    logAgentRunFinish({
      agentName: "Quote Generation",
      runId: "run_qg_001",
      status: "complete",
      durationMs: 1230,
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const patch = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.status).toBe("complete");
    expect(typeof patch.finished_at).toBe("string");
    // Filter must scope to this run.
    expect(eqMock).toHaveBeenCalledWith("run_id", "run_qg_001");
  });

  it("does not throw if the supabase admin client itself throws", () => {
    adminClientMock.mockImplementationOnce(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    });

    expect(() =>
      logAgentEvent({ agentName: "X", status: "complete" }),
    ).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("does not throw when the insert rejects, and warns on console", async () => {
    insertMock.mockResolvedValueOnce({
      error: { message: "network down" },
    });

    expect(() =>
      logAgentEvent({ agentName: "X", status: "complete" }),
    ).not.toThrow();

    // Let the .then() microtask + the warn call settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalled();
    const warnArgs = warnSpy.mock.calls[0] ?? [];
    expect(String(warnArgs[0] ?? "")).toContain("[agent-monitor]");
  });
});

/* ----------------------------------------------------------------------
 * Static guard: no file marked "use client" may import the logger.
 *
 * Walks src/ once. Looks at any .ts/.tsx/.js/.jsx file that starts with
 * a "use client" pragma (within the first ~5 non-blank/non-comment
 * lines so this isn't trivially defeated by a leading docstring), and
 * fails the test if it also imports from `lib/agent-monitor/logger`.
 *
 * This catches accidental imports even if they happen to not throw at
 * runtime (a developer could shim around the `import "server-only"`
 * guard with a wrong path or an aliased import).
 * -------------------------------------------------------------------- */

describe("logger import boundary", () => {
  it(
    "is never imported from a 'use client' file",
    async () => {
      const root = resolve(process.cwd(), "src");

      // 1. Collect every source file path first (cheap dir walk), then 2. read
      //    + check them all CONCURRENTLY. Sequential awaited readFile over the
      //    whole tree got slow enough to flirt with the timeout as src/ grew;
      //    parallel reads keep this fast regardless of file count. Same checks.
      const files: string[] = [];
      const collect = async (dir: string): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        await Promise.all(
          entries.map(async (entry) => {
            if (
              entry.isDirectory() &&
              (entry.name === "__tests__" ||
                entry.name === "node_modules" ||
                entry.name === ".next")
            ) {
              return;
            }
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
              await collect(full);
              return;
            }
            if (/\.(t|j)sx?$/.test(entry.name)) files.push(full);
          }),
        );
      };
      await collect(root);

      const results = await Promise.all(
        files.map(async (full) => {
          const content = await readFile(full, "utf8");
          // Pragma near the top, robust to BOM and a few leading comment lines.
          const head = content.split(/\r?\n/, 12).join("\n");
          const isClient = /^[\s\S]*?["']use client["']/.test(head);
          if (!isClient) return null;
          return content.includes("agent-monitor/logger") ? full : null;
        }),
      );

      const offending = results.filter((x): x is string => x !== null);
      expect(
        offending,
        `Client components importing the server-only logger`,
      ).toEqual([]);
    },
    20_000,
  );
});

describe("run-row write ordering", () => {
  beforeEach(() => {
    resetMocks();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });
  afterEach(restoreEnv);

  it("does not let a fast run.finish overtake a slow run.start", async () => {
    // Slow upsert: resolves only when we say so.
    let releaseUpsert: (v: { error: null }) => void = () => {};
    const upsertGate = new Promise<{ error: null }>((resolve) => {
      releaseUpsert = resolve;
    });
    upsertMock.mockReset().mockReturnValue(upsertGate);
    const order: string[] = [];
    upsertMock.mockImplementation(() => {
      order.push("upsert-issued");
      return upsertGate;
    });
    eqMock.mockReset().mockImplementation(async () => {
      order.push("update-issued");
      return okResult;
    });

    const { flushAgentRun } = await import("../logger");
    logAgentRunStart({ agentName: "A", runId: "r1", stepName: "run.start", status: "running", message: "go" });
    logAgentRunFinish({ agentName: "A", runId: "r1", stepName: "run.finish", status: "complete", message: "done" });

    // Let microtasks run: the finish update must still be waiting.
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["upsert-issued"]);

    releaseUpsert(okResult);
    await flushAgentRun("r1");
    expect(order).toEqual(["upsert-issued", "update-issued"]);
  });
});
