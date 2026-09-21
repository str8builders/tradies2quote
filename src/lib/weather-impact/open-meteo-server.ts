import "server-only";
import { fetchWeatherProvider } from "@/lib/weather-planning/provider-access";
import { normalizeOpenMeteo } from "./open-meteo";
import type { WeatherImpactInput } from "./types";

export async function fetchOpenMeteoWeather({
  latitude,
  longitude,
  signal,
}: {
  latitude: number;
  longitude: number;
  signal?: AbortSignal;
}): Promise<WeatherImpactInput> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    // 5 days so the PWA can show the full outlook; the better-window scan
    // still only reads the first 24 hourly slots.
    forecast_days: "5",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "showers",
      "weather_code",
      "wind_speed_10m",
      "wind_gusts_10m",
    ].join(","),
    hourly: [
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_gusts_10m",
      "temperature_2m",
      "visibility",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "precipitation_sum",
      "wind_speed_10m_max",
      "wind_gusts_10m_max",
    ].join(","),
  });

  const response = await fetchWeatherProvider("forecast", params, { signal });
  if (!response.ok) {
    throw new Error(`Weather provider returned ${response.status}`);
  }
  const data = (await response.json()) as Parameters<typeof normalizeOpenMeteo>[0];
  return normalizeOpenMeteo(data);
}

