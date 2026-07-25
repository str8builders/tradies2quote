import "server-only";
import { unstable_cache } from "next/cache";
import { geocodeAddress } from "@/lib/weather-planning/geocode";
import { fetchOpenMeteoWeather } from "./open-meteo";
import type { WeatherDailyForecast } from "./types";

/**
 * Week outlook for the tradie's own base (profile address) — the
 * dashboard's at-a-glance answer to "which days this week can I work
 * outside?", and the per-date weather shown on the schedule calendar.
 *
 * Day classification mirrors the risk engine's outdoor cutoffs in
 * evaluate.ts (gusts ≥45 kph hard-stop / ≥35 caution for exposed work)
 * so the dashboard never contradicts a per-job assessment.
 */

export type OutlookStatus = "safe" | "caution" | "unsafe";

export interface DayOutlook {
  /** YYYY-MM-DD in the site's local timezone. */
  date: string;
  status: OutlookStatus;
  condition: WeatherDailyForecast["condition"];
  tempMaxC: number | null;
  rainProbabilityMaxPct: number | null;
  windGustMaxKph: number | null;
  /** Short human label for the deciding factor, e.g. "Gusts 52 kph". */
  reason: string;
}

export interface WeekOutlookData {
  locality: string;
  days: DayOutlook[];
}

export function classifyOutlookDay(d: WeatherDailyForecast): DayOutlook {
  const gust = d.windGustMaxKph;
  const rainProb = d.rainProbabilityMaxPct;
  const rainSum = d.precipitationSumMm;
  const tempMax = d.tempMaxC;

  let status: OutlookStatus = "safe";
  let reason = "Good to work";

  // Caution tier first, so a later unsafe check can overwrite it.
  if (gust != null && gust >= 35) {
    status = "caution";
    reason = `Gusts ${Math.round(gust)} kph`;
  }
  if (rainProb != null && rainProb >= 45 && status === "safe") {
    status = "caution";
    reason = `Rain ${Math.round(rainProb)}%`;
  }
  if (tempMax != null && tempMax <= 3 && status === "safe") {
    status = "caution";
    reason = "Frost risk";
  }
  if (tempMax != null && tempMax >= 32 && status === "safe") {
    status = "caution";
    reason = `Heat ${Math.round(tempMax)}°`;
  }

  // Hard stops — aligned with evaluate.ts height/outdoor gust cutoffs.
  if (gust != null && gust >= 45) {
    status = "unsafe";
    reason = `Gusts ${Math.round(gust)} kph`;
  }
  if (rainProb != null && rainProb >= 70 && rainSum != null && rainSum >= 6) {
    status = "unsafe";
    reason = "Heavy rain likely";
  }

  return {
    date: d.date,
    status,
    condition: d.condition,
    tempMaxC: tempMax,
    rainProbabilityMaxPct: rainProb,
    windGustMaxKph: gust,
    reason,
  };
}

async function loadWeekOutlook(address: string): Promise<WeekOutlookData | null> {
  const geo = await geocodeAddress({ address });
  if (!geo) return null;
  const input = await fetchOpenMeteoWeather({
    latitude: geo.latitude,
    longitude: geo.longitude,
  });
  const days = (input.daily ?? []).slice(0, 5).map(classifyOutlookDay);
  if (days.length === 0) return null;
  return { locality: geo.matchedName.split(",")[0] ?? geo.matchedName, days };
}

/**
 * Cached per address for 30 minutes — the dashboard re-renders far more
 * often than a forecast meaningfully changes, and open-meteo is a free
 * shared service we shouldn't hammer.
 */
export const getWeekOutlook = unstable_cache(loadWeekOutlook, ["t2q-week-outlook"], {
  revalidate: 1800,
});
