// ── Weather provider adapter ───────────────────────────────────────────────
// SINGLE WEATHER SOURCE OF TRUTH for job planning. v1 uses Open-Meteo (free, no
// API key — same provider already used by src/lib/weather-impact). Everything
// behind this seam is normalised to ForecastSnapshot, so swapping in Tomorrow.io
// or MetService later means editing ONLY this file.
//
// The LLM is never a weather source: it only ever sees the ForecastSnapshot /
// WeatherAssessment produced here. Pat/Willa cannot fetch or invent weather.

import "server-only";
import type { ForecastHour, ForecastSnapshot, WeatherAlert } from "./types";

import { fetchWeatherProvider } from "./provider-access";

interface OpenMeteoHourly {
  time?: string[];
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
  weather_code?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  temperature_2m?: Array<number | null>;
  relative_humidity_2m?: Array<number | null>;
}

interface OpenMeteoResponse {
  timezone?: string;
  hourly?: OpenMeteoHourly;
}

export interface FetchForecastArgs {
  jobId: string;
  latitude: number;
  longitude: number;
  windowStart: string; // ISO with offset
  windowEnd: string; // ISO with offset
  now: string; // ISO clock for generated_at
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Fetch the hourly forecast for a job window and normalise it to a
 * ForecastSnapshot. We request in UTC so the returned hour strings are directly
 * comparable to the window epochs (no timezone maths needed to select hours).
 */
export async function fetchForecastForWindow(args: FetchForecastArgs): Promise<ForecastSnapshot> {
  const startMs = Date.parse(args.windowStart);
  const endMs = Date.parse(args.windowEnd);

  const params = new URLSearchParams({
    latitude: String(args.latitude),
    longitude: String(args.longitude),
    timezone: "UTC",
    forecast_days: "3",
    hourly: [
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
      "temperature_2m",
      "relative_humidity_2m",
    ].join(","),
  });

  const res = await fetchWeatherProvider("forecast", params, { signal: args.signal, fetchImpl: args.fetchImpl });
  if (!res.ok) {
    throw new Error(`Weather provider returned ${res.status}`);
  }
  const data = (await res.json()) as OpenMeteoResponse;
  const hourly = normaliseHourly(data.hourly ?? {}, startMs, endMs);
  const alerts = deriveAlerts(hourly);

  return {
    provider: "open_meteo",
    generated_at: args.now,
    job_id: args.jobId,
    latitude: args.latitude,
    longitude: args.longitude,
    timezone: data.timezone ?? "UTC",
    window: { start: args.windowStart, end: args.windowEnd },
    hourly,
    alerts,
  };
}

/** Select hours inside [start,end] and map Open-Meteo fields → ForecastHour. */
function normaliseHourly(h: OpenMeteoHourly, startMs: number, endMs: number): ForecastHour[] {
  const times = h.time ?? [];
  const out: ForecastHour[] = [];
  for (let i = 0; i < times.length; i++) {
    // timezone=UTC → strings like "2026-06-08T21:00"; append Z for epoch compare.
    const iso = `${times[i]}Z`;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms) || ms < startMs || ms > endMs) continue;
    const code = at(h.weather_code, i);
    out.push({
      time: iso,
      precip_probability: at(h.precipitation_probability, i),
      rain_mm: at(h.precipitation, i),
      wind_kmh: at(h.wind_speed_10m, i),
      gust_kmh: at(h.wind_gusts_10m, i),
      temperature_c: at(h.temperature_2m, i),
      humidity_percent: at(h.relative_humidity_2m, i),
      weather_code: codeLabel(code),
      lightning_or_storm: code == null ? null : isThunderstormCode(code),
    });
  }
  return out;
}

/**
 * Open-Meteo's free tier has no severe-weather alert feed, so we derive a
 * thunderstorm alert from weather codes. Flood alerts require a real alert
 * provider (future upgrade) — until then flood_alert rules effectively only
 * fire if a future provider supplies them. Documented in docs/weather-planning.md.
 */
function deriveAlerts(hourly: ForecastHour[]): WeatherAlert[] {
  if (hourly.some((hr) => hr.lightning_or_storm === true)) {
    return [{ type: "thunderstorm", severity: "moderate", headline: "Thunderstorm risk in the forecast window" }];
  }
  return [];
}

function at(values: Array<number | null> | undefined, i: number): number | null {
  return values?.[i] ?? null;
}

function isThunderstormCode(code: number): boolean {
  return code === 95 || code === 96 || code === 99;
}

function codeLabel(code: number | null): string | null {
  if (code == null) return null;
  if (isThunderstormCode(code)) return "thunderstorm";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if ([45, 48].includes(code)) return "fog";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([1, 2, 3].includes(code)) return "cloud";
  if (code === 0) return "clear";
  return "changing";
}
