import "server-only";
import { unstable_cache } from "next/cache";
import { TRADE_PROFILES } from "./config";
import { evaluateWeatherImpact } from "./evaluate";
import { fetchOpenMeteoWeather } from "./open-meteo";
import { classifyOutlookDay, type DayOutlook } from "./outlook";
import type { WeatherDailyForecast, WeatherImpactInput, WeatherImpactStatus, WeatherImpactTrade } from "./types";

/** One trade's call for the spot: safe / caution / unsafe, and why. */
export interface HereTrade {
  id: WeatherImpactTrade;
  label: string;
  status: WeatherImpactStatus;
  reason: string;
  /** When the call isn't safe: the next few hours that look better, else null. */
  betterWindow: string | null;
}

/** The forecast for one spot, shaped for the top bar's weather and the old dashboard. */
export interface HereWeather {
  current: {
    summary: string | null;
    /** Coarse condition right now, for the icon (null when the provider didn't say). */
    condition: WeatherDailyForecast["condition"] | null;
    temperatureC: number | null;
    windGustKph: number | null;
    rainProbabilityPct: number | null;
  };
  days: DayOutlook[];
  trades: HereTrade[];
}

/** Two decimals, about 1 km: a shared cache cell, and the exact spot never reaches the provider. */
export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Now, the next five days, and a call for every trade in TRADE_PROFILES
 * (the same risk engine as /app/weather, with its default site). Pure.
 */
export function hereWeatherFrom(input: WeatherImpactInput): HereWeather {
  const days = (input.daily ?? []).slice(0, 5).map(classifyOutlookDay);
  const trades = (Object.keys(TRADE_PROFILES) as WeatherImpactTrade[]).map((id) => {
    const result = evaluateWeatherImpact({ trade: id, weather: input });
    const safe = result.overall_status === "safe";
    return {
      id,
      label: TRADE_PROFILES[id].label,
      status: result.overall_status,
      reason: safe ? "No weather limits right now." : (result.reasons[0] ?? result.weather_summary),
      betterWindow: safe ? null : result.next_better_window,
    };
  });
  return {
    current: {
      summary: input.summary ?? null,
      condition: input.condition ?? null,
      temperatureC: input.temperatureC,
      windGustKph: input.windGustKph,
      rainProbabilityPct: input.rainProbabilityPct,
    },
    days,
    trades,
  };
}

/** The forecast for a rounded spot, cached 30 min per ~1 km cell (open-meteo is a shared free service). */
export const loadHereWeather = unstable_cache(
  async (lat: number, lng: number): Promise<HereWeather> =>
    hereWeatherFrom(await fetchOpenMeteoWeather({ latitude: lat, longitude: lng })),
  ["t2q-weather-here-v2"],
  { revalidate: 1800 },
);
