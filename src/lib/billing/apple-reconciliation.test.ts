import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), reconcile: vi.fn(), ready: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/lib/observability", () => ({ captureError: mocks.capture }));
vi.mock("./apple", () => ({ reconcileApple: mocks.reconcile }));
vi.mock("./apple-config", () => ({ appleSubscriptionsReady: mocks.ready }));
import { runAppleReconciliation } from "./apple-reconciliation";
import { POST } from "@/app/api/cron/apple-reconcile/route";
const row = (id: string) => ({ environment: "Production", original_transaction_id: id, user_id: "private-account-token" });
beforeEach(() => { vi.clearAllMocks(); mocks.ready.mockReturnValue(true); vi.stubEnv("CRON_SECRET", "synthetic-secret-at-least-32-characters"); });
afterEach(() => vi.unstubAllEnvs());
describe("Apple subscription recovery", () => {
  it("reconciles claimed lineages with their existing owner and reports partial failure", async () => {
    mocks.rpc.mockResolvedValue({ data: [row("private-id-1"), row("private-id-2")], error: null });
    mocks.reconcile.mockRejectedValueOnce(new Error("secret provider detail")).mockResolvedValueOnce({ ok: true });
    expect(await runAppleReconciliation()).toEqual({ ok: false, processed: 1, failed: 1, deferred: 0 });
    expect(mocks.reconcile).toHaveBeenNthCalledWith(2, "private-id-2", "Production", "private-account-token");
    expect(String(mocks.capture.mock.calls[0][0])).not.toContain("secret provider detail");
  });
  it("does not treat a failed claim as an empty successful run", async () => {
    const error = new Error("database unavailable"); mocks.rpc.mockResolvedValue({ error });
    await expect(runAppleReconciliation()).rejects.toBe(error);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("previews without claiming rows or contacting Apple", async () => {
    mocks.from.mockReturnValue({ select: () => ({ not: async () => ({ count: 42, error: null }) }) });
    expect(await runAppleReconciliation(true)).toMatchObject({ ok: true, dryRun: true, knownSubscriptions: 42, processed: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("requires the cron credential even for a preview", async () => {
    const response = await POST(new NextRequest("https://example.invalid/api/cron/apple-reconcile?dry_run=1", { method: "POST" }));
    expect(response.status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reports missing Apple configuration as a failed job", async () => {
    mocks.ready.mockReturnValue(false);
    const response = await POST(new NextRequest("https://example.invalid/api/cron/apple-reconcile", { method: "POST", headers: { authorization: "Bearer synthetic-secret-at-least-32-characters" } }));
    expect(response.status).toBe(503); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
