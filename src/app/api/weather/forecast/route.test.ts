import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const fixture = vi.hoisted(() => ({ user: { id: "synthetic-owner" } as { id: string } | null, fetch: vi.fn(), quota: true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: fixture.user } }) } }) }));
vi.mock("@/lib/weather-impact/open-meteo-server", () => ({ fetchOpenMeteoWeather: fixture.fetch }));
vi.mock("@/lib/rate-limit", () => ({ consumeFixedWindow: () => ({ ok: fixture.quota, resetAt: 1 }), tooManyRequestsResponse: () => new Response(null, { status: 429 }) }));
import { GET } from "./route";
beforeEach(() => { fixture.user = { id: "synthetic-owner" }; fixture.quota = true; fixture.fetch.mockReset(); });
describe("authenticated forecast proxy", () => {
  it("rejects anonymous requests before fetching", async () => {
    fixture.user = null;
    expect((await GET(new NextRequest("https://test.invalid/api/weather/forecast?lat=0&lng=0"))).status).toBe(401);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it.each(["", "?lat=&lng=0", "?lat=1", "?lat=91&lng=0", "?lat=NaN&lng=0"])("rejects missing or invalid coordinates %s", async (query) => {
    expect((await GET(new NextRequest(`https://test.invalid/api/weather/forecast${query}`))).status).toBe(400);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("rounds location before provider access", async () => {
    fixture.fetch.mockResolvedValue({ source: "Open-Meteo" });
    const result = await GET(new NextRequest("https://test.invalid/api/weather/forecast?lat=-41.29385&lng=174.77864"));
    expect(result.status).toBe(200);
    expect(fixture.fetch).toHaveBeenCalledWith(expect.objectContaining({ latitude: -41.29, longitude: 174.78 }));
  });
  it("bounds repeated requests", async () => {
    fixture.quota = false;
    expect((await GET(new NextRequest("https://test.invalid/api/weather/forecast?lat=0&lng=0"))).status).toBe(429);
    expect(fixture.fetch).not.toHaveBeenCalled();
  });
  it("does not leak provider failures", async () => {
    fixture.fetch.mockRejectedValue(new Error("private provider details"));
    const result = await GET(new NextRequest("https://test.invalid/api/weather/forecast?lat=0&lng=0"));
    expect(result.status).toBe(502); expect(await result.text()).not.toContain("private provider");
  });
});
