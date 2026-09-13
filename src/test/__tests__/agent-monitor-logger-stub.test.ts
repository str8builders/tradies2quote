import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * Guards the vitest alias that keeps unit tests OFF the production agent
 * monitor. See src/test/agent-monitor-logger-stub.ts for the history.
 *
 * Three things are proven here:
 *   1. `@/lib/agent-monitor/logger` resolves to the stub inside vitest, and
 *      its helpers complete without a database.
 *   2. The stub mirrors every runtime export of the real module (a missing
 *      export would be `undefined` at a call site and throw).
 *   3. No test file can reach `adminClient()` through the real logger: any
 *      test importing it by a relative path (which bypasses the alias) must
 *      mock `@/lib/supabase/admin` itself.
 */

const REAL_LOGGER = resolve(process.cwd(), "src/lib/agent-monitor/logger.ts");

describe("agent-monitor logger stub", () => {
  it("is what tests import for @/lib/agent-monitor/logger", async () => {
    const mod = (await import("@/lib/agent-monitor/logger")) as unknown as {
      __isAgentMonitorLoggerTestStub?: boolean;
    };
    expect(mod.__isAgentMonitorLoggerTestStub).toBe(true);
  });

  it("logs without a database and resolves flushAgentRun", async () => {
    const {
      flushAgentRun,
      logAgentApprovalNeeded,
      logAgentError,
      logAgentEvent,
      logAgentRunFinish,
      logAgentRunStart,
      logAgentStep,
      newRunId,
    } = await import("@/lib/agent-monitor/logger");

    const runId = newRunId("stubcheck");
    expect(runId.startsWith("stubcheck_")).toBe(true);
    expect(() => {
      logAgentRunStart({ agentName: "Test", runId, status: "running" });
      logAgentStep({ agentName: "Test", runId, status: "running" });
      logAgentEvent({ agentName: "Test", runId, status: "running" });
      logAgentApprovalNeeded({ agentName: "Test", runId, status: "waiting_approval" });
      logAgentError({ agentName: "Test", runId, status: "failed", message: "x" });
      logAgentRunFinish({ agentName: "Test", runId, status: "complete" });
    }).not.toThrow();
    await expect(flushAgentRun(runId)).resolves.toBeUndefined();
  });

  it("mirrors every runtime export of the real logger", async () => {
    // Read the real module as TEXT rather than importing it, so this test
    // cannot itself become a route to the service-role client.
    const source = await readFile(REAL_LOGGER, "utf8");
    const realExports = [
      ...source.matchAll(/^export\s+(?:async\s+)?(?:function|const|let)\s+(\w+)/gm),
    ].map((m) => m[1]);
    expect(realExports.length).toBeGreaterThan(0);

    const stub = await import("../agent-monitor-logger-stub");
    const stubExports = Object.keys(stub);
    const missing = realExports.filter((k) => !stubExports.includes(k));
    expect(missing, "stub is missing real logger exports").toEqual([]);
  });
});

describe("no test may reach adminClient() through the real logger", () => {
  it("any test importing it relatively must mock the admin client", async () => {
    const root = resolve(process.cwd(), "src");
    const loggerModule = REAL_LOGGER.replace(/\.ts$/, "");

    const files: string[] = [];
    const collect = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      await Promise.all(
        entries.map(async (entry) => {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".next") return;
            await collect(full);
            return;
          }
          if (/\.test\.(t|j)sx?$/.test(entry.name)) files.push(full);
        }),
      );
    };
    await collect(root);
    expect(files.length).toBeGreaterThan(0);

    const IMPORT_RE = /(?:from|import|vi\.mock\(|import\()\s*["']([^"']+)["']/g;
    const unmocked: string[] = [];

    await Promise.all(
      files.map(async (full) => {
        const content = await readFile(full, "utf8");
        const dir = resolve(full, "..");
        let hit = false;
        for (const m of content.matchAll(IMPORT_RE)) {
          const spec = m[1];
          if (!spec.startsWith(".")) continue;
          if (resolve(dir, spec).replace(/\.tsx?$/, "") === loggerModule) {
            hit = true;
          }
        }
        if (!hit) return;
        // A relative import dodges the alias, so the file owns the isolation.
        if (!/vi\.mock\(\s*["']@\/lib\/supabase\/admin["']/.test(content)) {
          unmocked.push(full);
        }
      }),
    );

    expect(
      unmocked,
      "tests importing the real agent-monitor logger relatively must vi.mock('@/lib/supabase/admin')",
    ).toEqual([]);
  });
});
