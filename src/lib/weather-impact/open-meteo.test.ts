import { describe, expect, it } from "vitest";
import { normalizeOpenMeteo } from "./open-meteo";

// 5-day daily outlook normalization — the strip shown on /app/weather.
describe("normalizeOpenMeteo daily (5-day outlook)", () => {
  it("converts the current interval to mm/hour without counting rain twice", () => {
    expect(normalizeOpenMeteo({ current: { precipitation: 1.5, rain: 1, showers: 0.5, interval: 900 } }).precipitationMmPerHour).toBe(6);
  });

  it("uses the hourly sum when the current aggregation interval is unknown", () => {
    expect(normalizeOpenMeteo({ current: { precipitation: 1.5 }, hourly: { precipitation: [4] } }).precipitationMmPerHour).toBe(4);
  });

  it("keeps missing precipitation unknown instead of inventing dry conditions", () => {
    expect(normalizeOpenMeteo({}).precipitationMmPerHour).toBeNull();
  });

  const daily = {
    time: ["2026-06-12", "2026-06-13", "2026-06-14", "2026-06-15", "2026-06-16"],
    weather_code: [0, 61, 95, 2, 45],
    temperature_2m_max: [18.4, 14.2, 13.1, 16.8, 15.0],
    temperature_2m_min: [9.1, 8.0, 7.4, 8.8, 6.9],
    precipitation_probability_max: [5, 85, 95, 30, 10],
    precipitation_sum: [0, 12.5, 22.1, 0.4, 0],
    wind_speed_10m_max: [18, 32, 45, 22, 12],
    wind_gusts_10m_max: [30, 55, 80, 38, 20],
  };

  it("maps all five days with conditions, temps and rain probability", () => {
    const out = normalizeOpenMeteo({ daily });
    expect(out.daily).toHaveLength(5);
    expect(out.daily?.map((d) => d.condition)).toEqual([
      "clear",
      "rain",
      "thunderstorm",
      "cloud",
      "fog",
    ]);
    expect(out.daily?.[0]).toMatchObject({
      date: "2026-06-12",
      tempMaxC: 18.4,
      tempMinC: 9.1,
      rainProbabilityMaxPct: 5,
      windGustMaxKph: 30,
    });
  });

  it("missing daily block yields an empty list (manual entry shows no strip)", () => {
    const out = normalizeOpenMeteo({});
    expect(out.daily).toEqual([]);
  });

  it("null holes stay null — never invented values", () => {
    const out = normalizeOpenMeteo({
      daily: { ...daily, temperature_2m_max: [null, null, null, null, null] },
    });
    expect(out.daily?.every((d) => d.tempMaxC === null)).toBe(true);
  });
});
