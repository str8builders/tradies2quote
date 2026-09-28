import { describe, expect, it } from "vitest";
import { normalizeOpenMeteo } from "./open-meteo";

// Current-hour precipitation: `precipitation` is already rain+showers+snow
// for the hour (Open-Meteo's contract), so summing all three double- (or
// triple-) counts. See src/lib/weather-impact/open-meteo.ts.
describe("normalizeOpenMeteo current precipitation (no double-counting)", () => {
  it("uses precipitation as-is — a realistic payload where it already includes rain + showers", () => {
    // A realistic Open-Meteo `current` block: light rain, no showers, and
    // `precipitation` already totals them (0.4 = 0.4 rain + 0 showers).
    const out = normalizeOpenMeteo({
      current: {
        time: "2026-06-12T09:00",
        precipitation: 0.4,
        rain: 0.4,
        showers: 0,
        weather_code: 61,
      },
    });
    expect(out.precipitationMmPerHour).toBe(0.4); // NOT 0.8 (0.4 + 0.4 + 0)
  });

  it("a mixed rain+showers hour: still just the reported total, not the sum of all three", () => {
    const out = normalizeOpenMeteo({
      current: { time: "2026-06-12T09:00", precipitation: 1.2, rain: 0.5, showers: 0.7, weather_code: 80 },
    });
    expect(out.precipitationMmPerHour).toBe(1.2); // NOT 2.4 (1.2 + 0.5 + 0.7)
  });

  it("falls back to rain + showers only when precipitation itself is missing", () => {
    const out = normalizeOpenMeteo({
      current: { time: "2026-06-12T09:00", rain: 0.3, showers: 0.2, weather_code: 80 },
    });
    expect(out.precipitationMmPerHour).toBe(0.5);
  });

  it("no reading at all stays zero, not null (rounded/summed from empty)", () => {
    const out = normalizeOpenMeteo({ current: { time: "2026-06-12T09:00", weather_code: 0 } });
    expect(out.precipitationMmPerHour).toBe(0);
  });
});

// The forecast location's own zone (`timezone=auto` in the request), so the
// "Observed" time can be shown for that place, not hardcoded to NZ.
describe("normalizeOpenMeteo timezone/offset (for the forecast location's own clock)", () => {
  it("carries the resolved IANA zone and its UTC offset", () => {
    const out = normalizeOpenMeteo({
      timezone: "America/Chicago",
      utc_offset_seconds: -18000,
      current: { time: "2026-06-12T09:00", weather_code: 0 },
    });
    expect(out.timezone).toBe("America/Chicago");
    expect(out.utcOffsetSeconds).toBe(-18000);
  });

  it("missing from the response stays null, never a fabricated default", () => {
    const out = normalizeOpenMeteo({ current: { time: "2026-06-12T09:00", weather_code: 0 } });
    expect(out.timezone).toBeNull();
    expect(out.utcOffsetSeconds).toBeNull();
  });
});

// 5-day daily outlook normalization — the strip shown on /app/weather.
describe("normalizeOpenMeteo daily (5-day outlook)", () => {
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
