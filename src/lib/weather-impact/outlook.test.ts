import { describe, expect, it } from "vitest";
import { classifyOutlookDay } from "./outlook";
import type { WeatherDailyForecast } from "./types";

const day = (over: Partial<WeatherDailyForecast>): WeatherDailyForecast => ({
  date: "2026-07-18",
  condition: "clear",
  summary: "",
  tempMaxC: 18,
  tempMinC: 8,
  rainProbabilityMaxPct: 10,
  precipitationSumMm: 0,
  windMaxKph: 15,
  windGustMaxKph: 20,
  ...over,
});

describe("classifyOutlookDay", () => {
  it("calm dry day is safe", () => {
    expect(classifyOutlookDay(day({})).status).toBe("safe");
  });

  it("gusts >= 45 kph are a hard stop (mirrors evaluate.ts)", () => {
    const d = classifyOutlookDay(day({ windGustMaxKph: 52 }));
    expect(d.status).toBe("unsafe");
    expect(d.reason).toContain("52");
  });

  it("gusts >= 35 kph are caution", () => {
    expect(classifyOutlookDay(day({ windGustMaxKph: 38 })).status).toBe("caution");
  });

  it("likely heavy rain is unsafe", () => {
    const d = classifyOutlookDay(
      day({ rainProbabilityMaxPct: 85, precipitationSumMm: 12 }),
    );
    expect(d.status).toBe("unsafe");
    expect(d.reason).toMatch(/rain/i);
  });

  it("moderate rain chance is caution, not unsafe", () => {
    expect(
      classifyOutlookDay(day({ rainProbabilityMaxPct: 50, precipitationSumMm: 2 }))
        .status,
    ).toBe("caution");
  });

  it("null fields never crash and stay safe", () => {
    expect(
      classifyOutlookDay(
        day({
          tempMaxC: null,
          rainProbabilityMaxPct: null,
          precipitationSumMm: null,
          windGustMaxKph: null,
        }),
      ).status,
    ).toBe("safe");
  });
});
