import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherProvider, weatherProviderURL } from "./provider-access";

afterEach(() => vi.unstubAllEnvs());

describe("commercial weather provider access", () => {
  it("uses reserved forecast and geocoding endpoints with server credentials", () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "synthetic-weather-secret");
    for (const [kind, host] of [["forecast", "customer-api.open-meteo.com"], ["geocoding", "customer-geocoding-api.open-meteo.com"]] as const) {
      const url = weatherProviderURL(kind, new URLSearchParams({ latitude: "-41.29" }));
      expect(url.hostname).toBe(host);
      expect(url.searchParams.get("apikey")).toBe("synthetic-weather-secret");
      expect(url.searchParams.get("latitude")).toBe("-41.29");
    }
  });
  it("blocks unconfigured commercial production requests before contacting the free endpoint", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("OPEN_METEO_API_KEY", "");
    const fetchImpl = vi.fn();
    await expect(fetchWeatherProvider("forecast", new URLSearchParams(), { fetchImpl })).rejects.toThrow("forecast service");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("allows free provider evaluation outside production", () => {
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("OPEN_METEO_API_KEY", "");
    expect(weatherProviderURL("forecast", new URLSearchParams()).hostname).toBe("api.open-meteo.com");
  });
  it("preserves cancellation and sanitizes URL-bearing provider failures", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "synthetic-weather-secret");
    const controller = new AbortController(); controller.abort();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      expect(init?.redirect).toBe("error");
      throw new Error("failed URL apikey=synthetic-weather-secret");
    });
    await expect(fetchWeatherProvider("forecast", new URLSearchParams(), { signal: controller.signal, fetchImpl })).rejects.toThrow(/^The forecast service did not answer\. Try again shortly\.$/);
  });
});
