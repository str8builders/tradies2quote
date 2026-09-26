export type WeatherImpactStatus = "safe" | "caution" | "unsafe";

export type WeatherImpactTrade =
  | "roofing"
  | "painting_exterior"
  | "concrete_slab"
  | "framing_carpentry"
  | "scaffolding_height"
  | "earthworks_digging"
  | "brick_block_laying"
  | "cladding_exterior"
  | "general_outdoor";

export interface WeatherImpactContext {
  workingAtHeight: boolean;
  exposedSite: boolean;
  surfaceWet: boolean;
  usingLiftScaffoldLadder: boolean;
  pouringConcreteToday: boolean;
  exteriorFinishApplication: boolean;
}

export interface WeatherForecastWindow {
  startsAt: string;
  rainProbabilityPct: number | null;
  precipitationMmPerHour: number | null;
  windGustKph: number | null;
  thunderstormRisk: boolean | null;
  temperatureC: number | null;
}

/** One calendar day of the 5-day outlook shown on /app/weather. */
export interface WeatherDailyForecast {
  /** ISO date (YYYY-MM-DD) in the site's local timezone. */
  date: string;
  /** Coarse condition bucket used to pick an icon + label. */
  condition: "clear" | "cloud" | "drizzle" | "rain" | "thunderstorm" | "fog" | "snow" | "changing";
  summary: string;
  tempMaxC: number | null;
  tempMinC: number | null;
  rainProbabilityMaxPct: number | null;
  precipitationSumMm: number | null;
  windMaxKph: number | null;
  windGustMaxKph: number | null;
}

export interface WeatherImpactInput {
  observedAt?: string | null;
  source?: string | null;
  summary?: string | null;
  /** Coarse condition right now (live fetches only), for an icon. */
  condition?: WeatherDailyForecast["condition"] | null;
  rainProbabilityPct: number | null;
  precipitationMmPerHour: number | null;
  windSpeedKph: number | null;
  windGustKph: number | null;
  thunderstormRisk: boolean | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  visibilityKm: number | null;
  forecast?: WeatherForecastWindow[];
  /** 5-day daily outlook (live fetches only; manual entry has none). */
  daily?: WeatherDailyForecast[];
}

export interface TriggeredWeatherRule {
  id: string;
  status: Exclude<WeatherImpactStatus, "safe">;
  score: number;
  reason: string;
  controls: string[];
  blockedTasks: string[];
  safeTasks: string[];
}

export interface WeatherImpactResult {
  overall_status: WeatherImpactStatus;
  severity_score: number;
  confidence: "normal" | "degraded";
  reasons: string[];
  controls: string[];
  blocked_tasks: string[];
  safe_tasks: string[];
  weather_summary: string;
  next_better_window: string | null;
  missing_fields: string[];
  triggered_rules: TriggeredWeatherRule[];
  advisory: string;
}
