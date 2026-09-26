import { describe, expect, it } from "vitest";
import { hereWeatherFrom, roundCoord } from "./here";
import { normalizeOpenMeteo } from "./open-meteo";

// A windy wet morning in Tauranga that clears after three hours.
const hours = Array.from({ length: 24 }, (_, i) => `2026-09-26T${String((9 + i) % 24).padStart(2, "0")}:00`);
const rough = (i: number) => i < 3;
const provider = (over: { gust?: number; code?: number } = {}) => ({
  current: {
    time: "2026-09-26T09:00",
    temperature_2m: 14.2,
    relative_humidity_2m: 70,
    apparent_temperature: 13,
    precipitation: 0.4,
    rain: 0,
    showers: 0,
    weather_code: over.code ?? 61,
    wind_speed_10m: 30,
    wind_gusts_10m: over.gust ?? 52,
  },
  hourly: {
    time: hours,
    precipitation_probability: hours.map((_, i) => (rough(i) ? 80 : 10)),
    precipitation: hours.map((_, i) => (rough(i) ? 0.6 : 0)),
    weather_code: hours.map((_, i) => (rough(i) ? 61 : 1)),
    wind_gusts_10m: hours.map((_, i) => (rough(i) ? 52 : 20)),
    temperature_2m: hours.map(() => 14),
    visibility: hours.map(() => 20000),
  },
  daily: {
    time: ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"],
    weather_code: [61, 1, 0, 3, 95],
    temperature_2m_max: [16, 17, 19, 15, 13],
    temperature_2m_min: [9, 8, 10, 9, 7],
    precipitation_probability_max: [80, 20, 5, 30, 90],
    precipitation_sum: [8, 0, 0, 0.5, 20],
    wind_speed_10m_max: [30, 15, 10, 20, 40],
    wind_gusts_10m_max: [52, 25, 18, 30, 70],
  },
});

describe("hereWeatherFrom", () => {
  it("now: the words, the condition for the icon, the temperature, gusts and rain chance", () => {
    const out = hereWeatherFrom(normalizeOpenMeteo(provider()));
    expect(out.current).toEqual({
      summary: "Rain/showers",
      condition: "rain",
      temperatureC: 14.2,
      windGustKph: 52,
      rainProbabilityPct: 80,
    });
  });

  it("five days, each with the outdoor call", () => {
    const out = hereWeatherFrom(normalizeOpenMeteo(provider()));
    expect(out.days.map((d) => [d.date, d.status])).toEqual([
      ["2026-09-26", "unsafe"],
      ["2026-09-27", "safe"],
      ["2026-09-28", "safe"],
      ["2026-09-29", "safe"],
      ["2026-09-30", "unsafe"],
    ]);
  });

  it("every trade gets a call; one that isn't safe says why and when it looks better", () => {
    const out = hereWeatherFrom(normalizeOpenMeteo(provider()));
    expect(out.trades).toHaveLength(9);
    const roofing = out.trades.find((t) => t.id === "roofing")!;
    expect(roofing).toMatchObject({ label: "Roofing", status: "unsafe" });
    expect(roofing.reason).toMatch(/gusts are 52 kph/);
    expect(roofing.betterWindow).toMatch(/looks better/);
  });

  it("a safe trade: plain words and no better window", () => {
    const out = hereWeatherFrom(normalizeOpenMeteo(provider({ gust: 18, code: 1 })));
    const general = out.trades.find((t) => t.id === "general_outdoor")!;
    expect(general.status).toBe("safe");
    expect(general.reason).toBe("No weather limits right now.");
    expect(general.betterWindow).toBeNull();
    expect(out.current.condition).toBe("cloud");
  });

  it("no current weather code: no condition (the button falls back to today's)", () => {
    const { current, ...rest } = provider();
    const { weather_code: _code, ...noCode } = current;
    expect(hereWeatherFrom(normalizeOpenMeteo({ ...rest, current: noCode })).current.condition).toBeNull();
  });
});

describe("roundCoord", () => {
  it("two decimals, about a kilometre", () => {
    expect(roundCoord(-37.68679)).toBe(-37.69);
    expect(roundCoord(176.16543)).toBe(176.17);
  });
});
