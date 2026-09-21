import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), purge: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ rpc: mock.rpc, from: mock.from }) }));
vi.mock("@/lib/account-deletion", () => ({ purgeAccount: mock.purge }));
vi.mock("@/lib/observability", () => ({ captureError: mock.capture }));
import { POST } from "./route";
const request = (preview = false, authenticated = true) => new NextRequest(`https://example.invalid/api/cron/account-deletions${preview ? '?dry_run=1' : ''}`, { method: "POST", headers: authenticated ? { authorization: "Bearer synthetic-secret-at-least-32-characters" } : {} });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRON_SECRET", "synthetic-secret-at-least-32-characters"); });
afterEach(() => vi.unstubAllEnvs());
describe("interrupted account deletion recovery", () => {
  it("requires authorization before claiming or reading pending accounts", async () => {
    expect((await POST(request(true, false))).status).toBe(401);
    expect(mock.from).not.toHaveBeenCalled(); expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("previews the queue without deleting accounts", async () => {
    mock.from.mockReturnValue({ select: async () => ({ count: 2, error: null }) });
    expect(await (await POST(request(true))).json()).toMatchObject({ ok: true, dryRun: true, pending: 2, processed: 0 });
    expect(mock.rpc).not.toHaveBeenCalled(); expect(mock.purge).not.toHaveBeenCalled();
  });
  it("continues to the next claimed account and reports a retryable partial failure without PII", async () => {
    mock.rpc.mockResolvedValue({ data: [{ user_id: "private-one" }, { user_id: "private-two" }], error: null });
    mock.purge.mockResolvedValueOnce({ ok: false, error: "private provider detail" }).mockResolvedValueOnce({ ok: true });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, processed: 1, failed: 1, deferred: 0 });
    expect(mock.purge).toHaveBeenNthCalledWith(2, "private-two");
    expect(JSON.stringify(mock.capture.mock.calls)).not.toContain("private provider detail");
  });
  it("does not report a database or provider exception as a successful empty queue", async () => {
    mock.rpc.mockResolvedValueOnce({ error: new Error("private database detail") });
    expect((await POST(request())).status).toBe(503);
    expect(mock.purge).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValueOnce({ data: [{ user_id: "private-one" }], error: null });
    mock.purge.mockRejectedValueOnce(new Error("private storage detail"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "deletion_batch_failed" });
  });
});
