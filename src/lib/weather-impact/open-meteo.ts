import type { WeatherDailyForecast, WeatherForecastWindow, WeatherImpactInput } from "./types";

interface OpenMeteoResponse {
  current?: {
    time?: string;
    interval?: number;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    precipitation?: number;
    rain?: number;
    showers?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_gusts_10m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation_probability?: Array<number | null>;
    precipitation?: Array<number | null>;
    weather_code?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    temperature_2m?: Array<number | null>;
    visibility?: Array<number | null>;
  };
  daily?: {
    time?: string[];
    weather_code?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    temperature_2m_min?: Array<number | null>;
    precipitation_probability_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
    wind_speed_10m_max?: Array<number | null>;
    wind_gusts_10m_max?: Array<number | null>;
  };
}

/** Browser adapter: credentials and commercial provider access stay on the server. */
export async function fetchOpenMeteoWeather({ latitude, longitude, signal }: {
  latitude: number; longitude: number; signal?: AbortSignal;
}): Promise<WeatherImpactInput> {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  const response = await fetch(`/api/weather/forecast?${params}`, { signal });
  if (!response.ok) throw new Error("The forecast service did not answer. Try again shortly.");
  return await response.json() as WeatherImpactInput;
}

export function normalizeOpenMeteo(data: OpenMeteoResponse): WeatherImpactInput {
  const current = data.current ?? {};
  const hourly = data.hourly ?? {};
  const currentHourIndex = findCurrentHourIndex(hourly.time, current.time);
  // Precipitation already includes rain/showers/snow. Current sums use the
  // provider's interval (often 15 minutes); convert to the rate this model
  // expects, or use the hourly sum. Missing observations remain unknown.
  const precipitation = current.precipitation != null && current.interval != null && current.interval > 0
    ? current.precipitation * 3600 / current.interval
    : valueAt(hourly.precipitation, currentHourIndex);
  const forecast = buildForecast(hourly, currentHourIndex);
  return {
    observedAt: current.time ?? null,
    source: "Open-Meteo",
    summary: weatherCodeSummary(current.weather_code),
    rainProbabilityPct: valueAt(hourly.precipitation_probability, currentHourIndex),
    precipitationMmPerHour: precipitation == null ? null : roundNumber(precipitation, 1),
    windSpeedKph: current.wind_speed_10m ?? null,
    windGustKph: current.wind_gusts_10m ?? null,
    thunderstormRisk: current.weather_code == null ? null : isThunderstormCode(current.weather_code),
    temperatureC: current.temperature_2m ?? null,
    feelsLikeC: current.apparent_temperature ?? null,
    humidityPct: current.relative_humidity_2m ?? null,
    visibilityKm: metersToKm(valueAt(hourly.visibility, currentHourIndex)),
    forecast,
    daily: buildDaily(data.daily ?? {}),
  };
}

function buildDaily(daily: NonNullable<OpenMeteoResponse["daily"]>): WeatherDailyForecast[] {
  const dates = daily.time ?? [];
  return dates.slice(0, 5).map((date, index) => {
    const code = valueAt(daily.weather_code, index);
    return {
      date,
      condition: codeCondition(code),
      summary: weatherCodeSummary(code ?? undefined) ?? "Weather changing",
      tempMaxC: valueAt(daily.temperature_2m_max, index),
      tempMinC: valueAt(daily.temperature_2m_min, index),
      rainProbabilityMaxPct: valueAt(daily.precipitation_probability_max, index),
      precipitationSumMm: valueAt(daily.precipitation_sum, index),
      windMaxKph: valueAt(daily.wind_speed_10m_max, index),
      windGustMaxKph: valueAt(daily.wind_gusts_10m_max, index),
    };
  });
}

function codeCondition(code: number | null): WeatherDailyForecast["condition"] {
  if (code == null) return "changing";
  if (isThunderstormCode(code)) return "thunderstorm";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([51, 53, 55].includes(code)) return "drizzle";
  if ([45, 48].includes(code)) return "fog";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([1, 2, 3].includes(code)) return "cloud";
  if (code === 0) return "clear";
  return "changing";
}

function buildForecast(
  hourly: NonNullable<OpenMeteoResponse["hourly"]>,
  startIndex: number,
): WeatherForecastWindow[] {
  const times = hourly.time ?? [];
  return times.slice(startIndex, startIndex + 24).map((startsAt, offset) => {
    const index = startIndex + offset;
    const code = valueAt(hourly.weather_code, index);
    return {
      startsAt,
      rainProbabilityPct: valueAt(hourly.precipitation_probability, index),
      precipitationMmPerHour: valueAt(hourly.precipitation, index),
      windGustKph: valueAt(hourly.wind_gusts_10m, index),
      thunderstormRisk: code == null ? null : isThunderstormCode(code),
      temperatureC: valueAt(hourly.temperature_2m, index),
    };
  });
}

function findCurrentHourIndex(times: string[] | undefined, currentTime: string | undefined) {
  if (!times?.length || !currentTime) return 0;
  const exact = times.indexOf(currentTime);
  if (exact >= 0) return exact;
  const current = new Date(currentTime).getTime();
  if (Number.isNaN(current)) return 0;
  const next = times.findIndex((time) => {
    const value = new Date(time).getTime();
    return !Number.isNaN(value) && value >= current;
  });
  return next >= 0 ? next : 0;
}

function valueAt(values: Array<number | null> | undefined, index: number) {
  return values?.[index] ?? null;
}

function metersToKm(value: number | null) {
  return value == null ? null : roundNumber(value / 1000, 1);
}

function roundNumber(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isThunderstormCode(code: number) {
  return code === 95 || code === 96 || code === 99;
}

function weatherCodeSummary(code: number | undefined) {
  if (code == null) return null;
  if (isThunderstormCode(code)) return "Thunderstorm risk";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "Rain/showers";
  if ([45, 48].includes(code)) return "Fog or low cloud";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow or ice risk";
  if ([1, 2, 3].includes(code)) return "Cloud changing";
  if (code === 0) return "Clear";
  return "Weather changing";
}
