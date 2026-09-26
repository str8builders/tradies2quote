import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  profile: { address: "14 Kauri St, Mount Maunganui 3116" } as { address: string | null } | null,
  geocode: vi.fn(),
  forecast: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/observability", () => ({ captureError: mock.capture }));
vi.mock("@/lib/weather-planning/geocode", () => ({ geocodeAddress: mock.geocode }));
vi.mock("@/lib/weather-impact/open-meteo", async (original) => ({
  ...(await original<typeof import("@/lib/weather-impact/open-meteo")>()),
  fetchOpenMeteoWeather: mock.forecast,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mock.user } }) },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            expect([table, columns, column, value]).toEqual(["profiles", "address", "id", "u1"]);
            return { data: mock.profile, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { GET } from "./route";

const calm = {
  summary: "Clear",
  condition: "clear" as const,
  rainProbabilityPct: 5,
  precipitationMmPerHour: 0,
  windSpeedKph: 10,
  windGustKph: 18,
  thunderstormRisk: false,
  temperatureC: 17,
  feelsLikeC: 17,
  humidityPct: 60,
  visibilityKm: 20,
  forecast: [],
  daily: [],
};

afterEach(() => {
  mock.user = { id: "u1" };
  mock.profile = { address: "14 Kauri St, Mount Maunganui 3116" };
  vi.clearAllMocks();
});

describe("GET /api/weather/base", () => {
  it("signed out: 401", async () => {
    mock.user = null;
    expect((await GET()).status).toBe(401);
  });

  it("no business address: 404 no-address, and nothing looked up", async () => {
    mock.profile = { address: "  " };
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: "no-address" });
    expect(mock.geocode).not.toHaveBeenCalled();
  });

  it("an address that isn't on the map: 404 not-found (and not reported as an error)", async () => {
    mock.geocode.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ reason: "not-found" });
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("the forecast at the address, for its town, from the rounded spot", async () => {
    mock.geocode.mockResolvedValueOnce({ latitude: -37.63891, longitude: 176.18561, timezone: null, matchedName: "Mount Maunganui, Bay of Plenty, New Zealand" });
    mock.forecast.mockResolvedValueOnce(calm);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, max-age=300");
    const body = await res.json();
    expect(body.locality).toBe("Mount Maunganui");
    expect(body.current).toMatchObject({ condition: "clear", temperatureC: 17 });
    expect(body.trades).toHaveLength(9);
    expect(mock.geocode).toHaveBeenCalledWith(expect.objectContaining({ address: "14 Kauri St, Mount Maunganui 3116" }));
    expect(mock.forecast).toHaveBeenCalledWith({ latitude: -37.64, longitude: 176.19 });
  });

  it("the forecast service failing: 502, reported", async () => {
    mock.geocode.mockResolvedValueOnce({ latitude: -37.6, longitude: 176.1, timezone: null, matchedName: "Tauranga" });
    mock.forecast.mockRejectedValueOnce(new Error("Weather provider returned 503"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const res = await GET();
    expect(res.status).toBe(502);
    expect(mock.capture).toHaveBeenCalledWith(expect.any(Error), { route: "/api/weather/base" });
  });
});
