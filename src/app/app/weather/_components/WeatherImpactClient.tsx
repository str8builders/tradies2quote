"use client";

import { WeatherAttribution } from "@/components/WeatherAttribution";
import { formatNZTime, formatWeekdayShort } from "@/lib/format-date";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  MapPin,
  ShieldCheck,
  Snowflake,
  Sun,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  DEFAULT_WEATHER_CONTEXT,
  TRADE_OPTIONS,
  evaluateWeatherImpact,
  fetchOpenMeteoWeather,
  type WeatherDailyForecast,
  type WeatherImpactContext,
  type WeatherImpactInput,
  type WeatherImpactStatus,
  type WeatherImpactTrade,
} from "@/lib/weather-impact";

// ── Job-location-first contract (P0 weather slice) ─────────────────────────
// The server (page.tsx) resolves WHICH location the weather is for — the
// client/customer job site stored on the quote. This component fetches live
// weather for THAT location and always labels it. Device location exists
// only as an explicit, labeled user choice — never a silent default.

export type JobOption = {
  id: string;
  label: string;
  address: string;
  scheduled: boolean;
};

export type JobLocation = {
  quoteId: string;
  address: string;
  latitude: number;
  longitude: number;
  matchedName: string;
  resolvedFrom: "site_context" | "geocoded_now";
};

const EMPTY_WEATHER: WeatherImpactInput = {
  rainProbabilityPct: null,
  precipitationMmPerHour: null,
  windSpeedKph: null,
  windGustKph: null,
  thunderstormRisk: null,
  temperatureC: null,
  feelsLikeC: null,
  humidityPct: null,
  visibilityKm: null,
  forecast: [],
};

const WEATHER_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    WeatherImpactInput,
    | "rainProbabilityPct"
    | "precipitationMmPerHour"
    | "windSpeedKph"
    | "windGustKph"
    | "temperatureC"
    | "feelsLikeC"
    | "humidityPct"
    | "visibilityKm"
  >;
  label: string;
  suffix: string;
  step: string;
}> = [
  { key: "rainProbabilityPct", label: "Rain chance", suffix: "%", step: "1" },
  { key: "precipitationMmPerHour", label: "Rain intensity", suffix: "mm/h", step: "0.1" },
  { key: "windSpeedKph", label: "Wind", suffix: "kph", step: "1" },
  { key: "windGustKph", label: "Gusts", suffix: "kph", step: "1" },
  { key: "temperatureC", label: "Temp", suffix: "deg C", step: "0.5" },
  { key: "feelsLikeC", label: "Feels like", suffix: "deg C", step: "0.5" },
  { key: "humidityPct", label: "Humidity", suffix: "%", step: "1" },
  { key: "visibilityKm", label: "Visibility", suffix: "km", step: "0.5" },
];

const CONTEXT_TOGGLES: ReadonlyArray<{
  key: keyof WeatherImpactContext;
  label: string;
}> = [
  { key: "workingAtHeight", label: "Working at height" },
  { key: "exposedSite", label: "Exposed site" },
  { key: "surfaceWet", label: "Wet/slippery surface" },
  { key: "usingLiftScaffoldLadder", label: "Ladder, scaffold, or lift" },
  { key: "pouringConcreteToday", label: "Pouring concrete today" },
  { key: "exteriorFinishApplication", label: "Exterior finish / adhesive" },
];

export function WeatherImpactClient({
  jobOptions,
  selectedQuoteId,
  jobLocation,
  geocodeFailed,
}: {
  jobOptions: JobOption[];
  selectedQuoteId: string | null;
  jobLocation: JobLocation | null;
  geocodeFailed: boolean;
}) {
  const router = useRouter();
  const [trade, setTrade] = useState<WeatherImpactTrade>("roofing");
  const [context, setContext] = useState<WeatherImpactContext>({
    ...DEFAULT_WEATHER_CONTEXT,
  });
  const [weather, setWeather] = useState<WeatherImpactInput>(EMPTY_WEATHER);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [fetchError, setFetchError] = useState<string | null>(null);
  // WHICH location the current weather values are for — always shown.
  // null = manual entry (no live fetch yet).
  const [locationFor, setLocationFor] = useState<string | null>(null);

  const result = useMemo(
    () => evaluateWeatherImpact({ trade, weather, context }),
    [trade, weather, context],
  );
  const status = STATUS_COPY[result.overall_status];

  // Job-location-first: when the server resolved the selected job's site,
  // fetch the live weather for THAT location automatically. All state
  // updates happen inside async callbacks (React 19 compiler rule: no
  // synchronous setState in an effect body).
  useEffect(() => {
    if (!jobLocation) return;
    let cancelled = false;
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 15_000);
    const start = setTimeout(() => {
      if (cancelled) return;
      setFetchState("loading");
      setFetchError(null);
      fetchOpenMeteoWeather({
        latitude: jobLocation.latitude,
        longitude: jobLocation.longitude,
        signal: controller.signal,
      })
        .then((nextWeather) => {
          if (cancelled) return;
          setWeather(nextWeather);
          setLocationFor(`Job site: ${jobLocation.matchedName}`);
          setFetchState("ready");
        })
        .catch((error) => {
          if (cancelled) return;
          setFetchState("error");
          setFetchError(
            error instanceof Error && error.name !== "AbortError"
              ? error.message
              : "Could not load weather for the job site. Retry, or enter conditions manually.",
          );
        })
        .finally(() => clearTimeout(abortTimer));
    }, 0);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(abortTimer);
      clearTimeout(start);
    };
    // Refetch when the selected job (or its resolved coords) changes.
  }, [jobLocation?.quoteId, jobLocation?.latitude, jobLocation?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  function retryJobWeather() {
    if (!jobLocation) return;
    setFetchState("loading");
    setFetchError(null);
    fetchOpenMeteoWeather({
      latitude: jobLocation.latitude,
      longitude: jobLocation.longitude,
    })
      .then((nextWeather) => {
        setWeather(nextWeather);
        setLocationFor(`Job site: ${jobLocation.matchedName}`);
        setFetchState("ready");
      })
      .catch((error) => {
        setFetchState("error");
        setFetchError(
          error instanceof Error
            ? error.message
            : "Could not load weather for the job site.",
        );
      });
  }

  // EXPLICIT device fallback — never a default. Clearly labeled as the
  // tradie's device location, not the job site.
  async function useDeviceWeather() {
    setFetchState("loading");
    setFetchError(null);
    try {
      const position = await getCurrentPosition();
      const nextWeather = await fetchOpenMeteoWeather({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      setWeather(nextWeather);
      setLocationFor("Your device location (not the job site)");
      setFetchState("ready");
    } catch (error) {
      setFetchState("error");
      setFetchError(
        error instanceof Error
          ? error.message
          : "Could not load weather. You can still enter conditions manually.",
      );
    }
  }

  function updateWeatherNumber(
    key: (typeof WEATHER_FIELDS)[number]["key"],
    rawValue: string,
  ) {
    setWeather((current) => ({
      ...current,
      [key]: rawValue.trim() === "" ? null : Number(rawValue),
    }));
  }

  return (
    <div className="space-y-5">
      <section className={`t2q-card-pro overflow-hidden border ${status.shell}`}>
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <span
            aria-hidden="true"
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${status.icon}`}
          >
            <status.Icon size={26} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="t2q-section-label-pro">{"// weather impact"}</p>
            <h2 className={`mt-2 text-3xl font-semibold sm:text-4xl ${status.text}`}>
              {status.label}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-300">
              {result.weather_summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge label={`Score ${result.severity_score}/100`} />
              {/* WHICH location this weather is for — always visible. */}
              <Badge
                label={`Weather for: ${locationFor ?? "manual entry (no live location)"}`}
                emphasis
              />
              <Badge
                label={
                  result.confidence === "degraded"
                    ? "Incomplete weather data"
                    : weather.source ?? "Manual conditions"
                }
              />
              {weather.observedAt ? <Badge label={`Observed ${formatObserved(weather.observedAt)}`} /> : null}
            </div>
          </div>
        </div>
      </section>

      {weather.source === "Open-Meteo" ? <WeatherAttribution /> : null}
      {/* 5-day outlook — live fetches only (manual entry has no forecast). */}
      {weather.daily && weather.daily.length > 0 ? (
        <section className="t2q-card-pro p-5 sm:p-6" data-testid="weather-5day">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="t2q-section-label-pro">{"// 5-day outlook"}</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Next 5 days</h3>
            </div>
            {locationFor ? (
              <p className="hidden text-xs font-semibold text-ink-400 sm:block">{locationFor}</p>
            ) : null}
          </div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {weather.daily.slice(0, 5).map((day, index) => (
              <DailyForecastCard key={day.date} day={day} isToday={index === 0} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[0.86fr_1.14fr]">
        <div className="space-y-5">
          {/* Job picker — the weather location comes from the JOB on record. */}
          <section className="t2q-card-pro p-5 sm:p-6">
            <p className="t2q-section-label-pro">{"// job site"}</p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Which job is this for?
            </h3>
            {jobOptions.length > 0 ? (
              <>
                <label className="mt-4 block">
                  <span className="sr-only">Select job</span>
                  <select
                    value={selectedQuoteId ?? ""}
                    onChange={(event) => {
                      const id = event.target.value;
                      router.push(
                        id ? `/app/weather?quote=${id}` : "/app/weather",
                      );
                    }}
                    data-testid="weather-job-picker"
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-base font-semibold text-white"
                  >
                    <option value="">No job selected — manual conditions</option>
                    {jobOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.scheduled ? "[scheduled] " : ""}
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {jobLocation ? (
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">
                    Live weather loads for{" "}
                    <span className="font-semibold text-white">
                      {jobLocation.matchedName}
                    </span>{" "}
                    (from the job&apos;s client address).
                  </p>
                ) : null}
                {geocodeFailed ? (
                  <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                    Couldn&apos;t place this job&apos;s address on the map.
                    Enter conditions manually, or use your device location
                    below (clearly marked as not the job site).
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-ink-400">
                No quotes with a client address yet — add the client&apos;s
                address on a quote and it&apos;ll appear here. You can still
                enter conditions manually below.
              </p>
            )}
          </section>

          <section className="t2q-card-pro p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t2q-section-label-pro">{"// setup"}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Trade and site</h3>
              </div>
              <CloudSun size={24} weight="bold" className="text-brand" aria-hidden="true" />
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-ink-300">Trade</span>
              <select
                value={trade}
                onChange={(event) => setTrade(event.target.value as WeatherImpactTrade)}
                className="mt-2 h-12 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-base font-semibold text-white"
              >
                {TRADE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-5 grid grid-cols-1 gap-2">
              {CONTEXT_TOGGLES.map((toggle) => {
                const checked = context[toggle.key];
                return (
                  <label
                    key={toggle.key}
                    className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                      checked
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-white/10 bg-white/[0.02] text-ink-300"
                    }`}
                  >
                    <span>{toggle.label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setContext((current) => ({
                          ...current,
                          [toggle.key]: event.target.checked,
                        }))
                      }
                      className="h-5 w-5 accent-brand"
                    />
                  </label>
                );
              })}
            </div>
          </section>

          <section className="t2q-card-pro p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="t2q-section-label-pro">{"// current weather"}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">Conditions</h3>
              </div>
              <button
                type="button"
                onClick={useDeviceWeather}
                disabled={fetchState === "loading"}
                data-testid="weather-device-location"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-3 text-sm font-semibold text-ink-300 disabled:opacity-60"
              >
                {fetchState === "loading" ? (
                  <ArrowClockwise size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <MapPin size={17} weight="bold" aria-hidden="true" />
                )}
                Use my device location
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-400">
              Device location is your phone&apos;s position — not the job site.
              Pick a job above to load weather for the client&apos;s address.
            </p>
            {fetchState === "loading" && jobLocation ? (
              <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-ink-300">
                Loading live weather for {jobLocation.matchedName}…
              </p>
            ) : null}
            {fetchError ? (
              <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                <p>{fetchError}</p>
                {jobLocation ? (
                  <button
                    type="button"
                    onClick={retryJobWeather}
                    data-testid="weather-retry-job"
                    className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg border border-amber-500/40 px-3 text-xs font-semibold text-amber-200"
                  >
                    <ArrowClockwise size={14} aria-hidden="true" />
                    Retry job-site weather
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="mt-5 grid grid-cols-2 gap-3">
              {WEATHER_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="text-xs font-semibold text-ink-400">{field.label}</span>
                  <span className="mt-1 flex h-12 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3">
                    <input
                      type="number"
                      inputMode="decimal"
                      step={field.step}
                      value={weather[field.key] ?? ""}
                      onChange={(event) => updateWeatherNumber(field.key, event.target.value)}
                      className="min-w-0 flex-1 border-0 bg-transparent p-0 text-base font-semibold text-white outline-none"
                    />
                    <span className="ml-2 text-xs font-semibold text-ink-400">
                      {field.suffix}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <label
              className={`mt-3 flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-semibold ${
                weather.thunderstormRisk
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : "border-white/10 bg-white/[0.02] text-ink-300"
              }`}
            >
              <span>Lightning / thunderstorm risk</span>
              <input
                type="checkbox"
                checked={weather.thunderstormRisk === true}
                onChange={(event) =>
                  setWeather((current) => ({
                    ...current,
                    thunderstormRisk: event.target.checked,
                  }))
                }
                className="h-5 w-5 accent-brand"
              />
            </label>
          </section>
        </div>

        <div className="space-y-5">
          <ResultSection
            title="Why?"
            items={result.reasons}
            empty="No weather rule has fired yet."
          />
          <ResultSection
            title="Recommended actions"
            items={result.controls}
            empty="Keep monitoring conditions."
          />
          <section className="grid gap-5 sm:grid-cols-2">
            <ResultSection
              title="Blocked tasks"
              items={result.blocked_tasks}
              empty="No blocked tasks from weather rules."
            />
            <ResultSection
              title="Still useful"
              items={result.safe_tasks}
              empty="Add current conditions to see suggested safe tasks."
            />
          </section>
          <section className="t2q-card-pro p-5 sm:p-6">
            <p className="t2q-section-label-pro">{"// better window"}</p>
            <p className="mt-3 text-sm leading-relaxed text-ink-300">
              {result.next_better_window ??
                "No better 3-hour window found in the available forecast yet."}
            </p>
          </section>
          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-ink-400">
            {result.advisory}
          </p>
        </div>
      </section>
    </div>
  );
}

function ResultSection({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <section className="t2q-card-pro p-5 sm:p-6">
      <p className="t2q-section-label-pro">{`// ${title}`}</p>
      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-sm leading-relaxed text-ink-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-ink-400">{empty}</p>
      )}
    </section>
  );
}

const CONDITION_ICONS: Record<
  WeatherDailyForecast["condition"],
  { Icon: typeof Sun; tint: string }
> = {
  clear: { Icon: Sun, tint: "text-hivis" },
  cloud: { Icon: CloudSun, tint: "text-ink-300" },
  drizzle: { Icon: CloudRain, tint: "text-sky-300" },
  rain: { Icon: CloudRain, tint: "text-sky-300" },
  thunderstorm: { Icon: CloudLightning, tint: "text-red-300" },
  fog: { Icon: CloudFog, tint: "text-ink-300" },
  snow: { Icon: Snowflake, tint: "text-sky-200" },
  changing: { Icon: Cloud, tint: "text-ink-300" },
};

function DailyForecastCard({ day, isToday }: { day: WeatherDailyForecast; isToday: boolean }) {
  const { Icon, tint } = CONDITION_ICONS[day.condition];
  const wet = day.condition === "rain" || day.condition === "thunderstorm";
  return (
    <div
      className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-1.5 py-3 text-center ${
        wet ? "border-sky-500/30 bg-sky-500/[0.06]" : "border-white/10 bg-white/[0.03]"
      }`}
      title={day.summary}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        {isToday ? "Today" : formatDayLabel(day.date)}
      </p>
      <Icon size={24} weight="bold" className={tint} aria-hidden="true" />
      <p className="text-sm font-semibold text-white">
        {formatTemp(day.tempMaxC)}
        <span className="ml-1 font-normal text-ink-400">{formatTemp(day.tempMinC)}</span>
      </p>
      <p className={`text-[11px] font-semibold ${wet ? "text-sky-300" : "text-ink-400"}`}>
        {day.rainProbabilityMaxPct != null ? `${Math.round(day.rainProbabilityMaxPct)}%` : "—"}
      </p>
      {day.windGustMaxKph != null && day.windGustMaxKph >= 50 ? (
        <p className="text-[10px] font-semibold text-amber-300">
          gusts {Math.round(day.windGustMaxKph)}
        </p>
      ) : null}
    </div>
  );
}

function formatDayLabel(isoDate: string) {
  return formatWeekdayShort(isoDate);
}

function formatTemp(value: number | null) {
  return value == null ? "—" : `${Math.round(value)}°`;
}

function Badge({ label, emphasis = false }: { label: string; emphasis?: boolean }) {
  return (
    <span
      className={
        emphasis
          ? "rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand"
          : "rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-ink-300"
      }
    >
      {label}
    </span>
  );
}

const STATUS_COPY: Record<
  WeatherImpactStatus,
  {
    label: string;
    text: string;
    shell: string;
    icon: string;
    Icon: typeof ShieldCheck;
  }
> = {
  safe: {
    label: "Safe to work",
    text: "text-emerald-300",
    shell: "border-emerald-500/40 bg-emerald-500/10",
    icon: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    Icon: ShieldCheck,
  },
  caution: {
    label: "Use caution",
    text: "text-amber-300",
    shell: "border-amber-500/40 bg-amber-500/10",
    icon: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    Icon: Warning,
  },
  unsafe: {
    label: "Not safe to work",
    text: "text-red-300",
    shell: "border-red-500/40 bg-red-500/10",
    icon: "border-red-500/40 bg-red-500/10 text-red-300",
    Icon: XCircle,
  },
};

function getCurrentPosition(): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error("Location is not available in this browser."));
  }
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 10 * 60 * 1000,
      timeout: 12_000,
    });
  });
}

function formatObserved(value: string) {
  const label = formatNZTime(value);
  return label === "—" ? value : label;
}
