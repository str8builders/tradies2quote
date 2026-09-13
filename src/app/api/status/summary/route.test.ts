import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ collect: vi.fn() }));
vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ from: vi.fn() }) }));
vi.mock("@/lib/status-summary", async (original) => ({ ...(await original<typeof import("@/lib/status-summary")>()), collectStatusSummary: mock.collect }));
import { GET } from "./route";

const TOKEN = "status-token-".repeat(3);
const req = (auth?: string) => new Request("https://tradies2quote.com/api/status/summary", { headers: auth ? { authorization: auth } : {} });

describe("GET /api/status/summary", () => {
  beforeEach(() => { vi.stubEnv("T2Q_STATUS_TOKEN", TOKEN); mock.collect.mockResolvedValue({ ok: true, agents: { runs: 1 } }); });
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("is invisible when no token is configured", async () => {
    vi.stubEnv("T2Q_STATUS_TOKEN", "");
    expect((await GET(req(`Bearer ${TOKEN}`))).status).toBe(404);
  });
  it("rejects a missing or wrong token", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(mock.collect).not.toHaveBeenCalled();
  });
  it("returns the summary with no-store for the right token", async () => {
    const res = await GET(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ ok: true, agents: { runs: 1 } });
  });
  it("answers 500 without leaking when the collector throws", async () => {
    mock.collect.mockRejectedValueOnce(new Error("db exploded"));
    const res = await GET(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "summary_failed" });
  });
});
