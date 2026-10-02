// "Weather impact" in the new look, rendered in node. The first paint comes
// from the real screen (the real useWeatherImpact); every later state is
// drawn by WeatherImpactView from a state object built the way the hook
// builds it, with the call worked out by the same risk engine. Each state
// keeps the old look's test ids and words, and follows the design rules, so
// outdoor mode can't turn it white-on-white.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { DEFAULT_WEATHER_CONTEXT, TRADE_OPTIONS } from "@/lib/weather-impact/config";
import { evaluateWeatherImpact } from "@/lib/weather-impact/evaluate";
import type { WeatherDailyForecast, WeatherImpactInput } from "@/lib/weather-impact/types";
import {
  EMPTY_WEATHER,
  type JobLocation,
  type JobOption,
  type WeatherImpactProps,
  type WeatherImpactState,
} from "../_components/WeatherImpactClient";
import type { StorageLike } from "@/app/app/_v2/shell/weather-now";
import { WeatherImpactView, plainReasons, rememberedTrade } from "./WeatherImpact";
import { WeatherScreen } from "./WeatherScreen";

const noop = () => {};
const later = async () => {};

const JOBS: JobOption[] = [
  { id: "q-1", label: "Deck rebuild — 12 Beach Rd, Tauranga", address: "12 Beach Rd, Tauranga", scheduled: true },
  { id: "q-2", label: "New fence — 4 Hill St, Katikati", address: "4 Hill St, Katikati", scheduled: false },
];

const SITE: JobLocation = {
  quoteId: "q-1",
  address: "12 Beach Rd, Tauranga",
  latitude: -37.69,
  longitude: 176.17,
  matchedName: "Tauranga, Bay of Plenty",
  resolvedFrom: "site_context",
};

const DAYS: WeatherDailyForecast[] = [
  { date: "2026-09-26", condition: "drizzle", summary: "Drizzle", tempMaxC: 16.4, tempMinC: 9.2, rainProbabilityMaxPct: 60, precipitationSumMm: 2, windMaxKph: 25, windGustMaxKph: 38 },
  { date: "2026-09-27", condition: "clear", summary: "Clear sky", tempMaxC: 18, tempMinC: 8, rainProbabilityMaxPct: 5, precipitationSumMm: 0, windMaxKph: 12, windGustMaxKph: 20 },
  { date: "2026-09-28", condition: "thunderstorm", summary: "Thunderstorm risk", tempMaxC: 13, tempMinC: 10, rainProbabilityMaxPct: 90, precipitationSumMm: 20, windMaxKph: 40, windGustMaxKph: 72 },
  { date: "2026-09-29", condition: "cloud", summary: "Partly cloudy", tempMaxC: 15, tempMinC: null, rainProbabilityMaxPct: null, precipitationSumMm: null, windMaxKph: 18, windGustMaxKph: 25 },
  { date: "2026-09-30", condition: "fog", summary: "Fog", tempMaxC: null, tempMinC: 6, rainProbabilityMaxPct: 10, precipitationSumMm: 0, windMaxKph: 10, windGustMaxKph: 15 },
];

/** Gusty now, calm from mid-afternoon: a roofer gets a caution and a better window. */
const HOURS = Array.from({ length: 24 }, (_, i) => ({
  startsAt: `2026-09-26T${String((14 + i) % 24).padStart(2, "0")}:00`,
  rainProbabilityPct: i < 2 ? 60 : 5,
  precipitationMmPerHour: i < 2 ? 0.4 : 0,
  windGustKph: i < 2 ? 38 : 12,
  thunderstormRisk: false,
  temperatureC: 15,
}));

/** A live Open-Meteo reading, as fetchOpenMeteoWeather returns it. */
const LIVE: WeatherImpactInput = {
  observedAt: "2026-09-26T14:00",
  source: "Open-Meteo",
  summary: "Drizzle",
  condition: "drizzle",
  rainProbabilityPct: 60,
  precipitationMmPerHour: 0.4,
  windSpeedKph: 22,
  windGustKph: 38,
  thunderstormRisk: false,
  temperatureC: 14.4,
  feelsLikeC: 12,
  humidityPct: 80,
  visibilityKm: 10,
  forecast: HOURS,
  daily: DAYS,
};

const CALM: WeatherImpactInput = {
  ...LIVE,
  summary: "Clear sky",
  condition: "clear",
  rainProbabilityPct: 5,
  precipitationMmPerHour: 0,
  windSpeedKph: 10,
  windGustKph: 15,
  temperatureC: 18,
  feelsLikeC: 18,
  humidityPct: 60,
  visibilityKm: 20,
};

/** A state as useWeatherImpact holds it, with the call it works out from the trade, site and weather. */
function state(patch: Partial<Omit<WeatherImpactState, "result">> = {}): WeatherImpactState {
  const trade = patch.trade ?? "roofing";
  const context = patch.context ?? { ...DEFAULT_WEATHER_CONTEXT };
  const weather = patch.weather ?? EMPTY_WEATHER;
  return {
    trade,
    setTrade: noop,
    context,
    setContext: noop,
    weather,
    setWeather: noop,
    fetchState: "idle",
    fetchError: null,
    locationFor: null,
    pickJob: noop,
    retryJobWeather: noop,
    loadDeviceWeather: later,
    updateWeatherNumber: noop,
    ...patch,
    result: evaluateWeatherImpact({ trade, weather, context }),
  };
}

const PICKED: WeatherImpactProps = { jobOptions: JOBS, selectedQuoteId: "q-1", jobLocation: SITE, geocodeFailed: false };
const NOTHING_PICKED: WeatherImpactProps = { jobOptions: JOBS, selectedQuoteId: null, jobLocation: null, geocodeFailed: false };

const view = (w: WeatherImpactState, props: WeatherImpactProps = PICKED) =>
  renderToStaticMarkup(<WeatherImpactView {...props} w={w} />);
const screen = (props: WeatherImpactProps = NOTHING_PICKED, enabled = true) =>
  renderToStaticMarkup(<WeatherScreen enabled={enabled} {...props} />);

/** From an element's opening tag up to the next one's. */
function section(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  expect(at, testId).toBeGreaterThanOrEqual(0);
  return html.slice(html.lastIndexOf("<", at));
}
/** The switch that follows a label: its opening tag. */
function switchAfter(html: string, label: string): string {
  const from = html.indexOf(`>${label}</label>`);
  expect(from, label).toBeGreaterThanOrEqual(0);
  const at = html.indexOf('role="switch"', from);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

const READY = state({ fetchState: "ready", weather: LIVE, locationFor: `Job site: ${SITE.matchedName}` });
const STATES: Record<string, string> = {
  "first paint": screen(),
  "no jobs yet": screen({ ...NOTHING_PICKED, jobOptions: [] }),
  "loading the job site": view(state({ fetchState: "loading" })),
  ready: view(READY),
  lightning: view(state({ fetchState: "ready", weather: { ...LIVE, thunderstormRisk: true }, locationFor: "Job site: Tauranga" })),
  safe: view(state({ fetchState: "ready", trade: "general_outdoor", weather: CALM, locationFor: "Job site: Tauranga" })),
  "job-site error": view(state({ fetchState: "error", fetchError: "Weather provider returned 503" })),
  "device error": view(state({ fetchState: "error", fetchError: "Could not load weather." }), NOTHING_PICKED),
  "device location": view(
    state({ fetchState: "ready", weather: LIVE, locationFor: "Your device location (not the job site)" }),
    NOTHING_PICKED,
  ),
  "address not placed": view(state(), { ...NOTHING_PICKED, selectedQuoteId: "q-2", geocodeFailed: true }),
  parked: screen(NOTHING_PICKED, false),
};

describe("/app/weather in the new look", () => {
  it("the screen: Weather impact, a way back Home, and no old header or safety-net marker", () => {
    const out = STATES["first paint"];
    expect(out).toContain('data-testid="weather-screen"');
    expect(out).toContain(">Weather impact</h1>");
    expect(out).toMatch(/<a [^>]*href="\/app"[^>]*>(?:(?!<\/a>).)*Home<\/a>/);
    expect(out).not.toContain("data-legacy-body");
    expect(out).not.toContain("t2q-");
  });

  it("first paint, no job picked: manual conditions, and caution until there are numbers", () => {
    const out = STATES["first paint"];
    expect(out).toContain('data-state="idle"');
    // The job picker: the old choices, "Scheduled" in words, and none picked short enough for a phone.
    const picker = section(out, "weather-job-picker");
    expect(picker).toContain('<option value="" selected="">No job picked</option>');
    expect(picker).toContain('<option value="q-1">Scheduled: Deck rebuild — 12 Beach Rd, Tauranga</option>');
    expect(picker).toContain('<option value="q-2">New fence — 4 Hill St, Katikati</option>');
    expect(out).toContain("Which job is this for?");
    // The call with no numbers yet, and which location it's for (always shown).
    const verdict = section(out, "weather-verdict");
    expect(verdict).toMatch(/^<section[^>]*data-status="caution"/);
    expect(verdict).toContain(">Use caution</h2>");
    expect(verdict).toContain("Weather data missing — add current conditions first.");
    expect(verdict).toContain("Weather for: manual entry (no live location)");
    expect(verdict).toContain("Incomplete weather data");
    expect(verdict).toMatch(/Score \d+\/100/);
    expect(out).not.toContain("weather-5day");
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain("weather-loading");
    // Roofing picked first, as in the old look.
    expect(out).toMatch(/role="radio" aria-checked="true" data-trade="roofing"/);
    // Six site switches and the lightning one; an exposed site is on to start with.
    expect(out.match(/role="switch"/g)).toHaveLength(7);
    expect(switchAfter(out, "Exposed site")).toContain('aria-checked="true"');
    expect(switchAfter(out, "Working at height")).toContain('aria-checked="false"');
    expect(switchAfter(out, "Lightning / thunderstorm risk")).toContain('aria-checked="false"');
    // Eight number boxes, empty, with degrees written as degrees.
    const conditions = section(out, "weather-conditions");
    expect(conditions.match(/type="number"/g)).toHaveLength(8);
    expect(conditions).toContain("°C");
    expect(conditions).not.toContain("deg C");
    expect(out).toContain('data-testid="weather-device-location"');
    expect(out).toContain("Advisory only");
    // Typed-in conditions aren't Open-Meteo's: no credit.
    expect(out).not.toContain("weather-credit");
  });

  it("no jobs with a client address yet: says how to get one there, and manual entry still works", () => {
    const out = STATES["no jobs yet"];
    expect(out).toContain("No quotes with a client address yet");
    expect(out).not.toContain("weather-job-picker");
    expect(out).toContain('data-testid="weather-device-location"');
    expect(section(out, "weather-conditions").match(/type="number"/g)).toHaveLength(8);
  });

  it("loading the job's site: says where, and the device button waits", () => {
    const out = STATES["loading the job site"];
    expect(out).toContain('<option value="q-1" selected="">Scheduled: Deck rebuild');
    expect(out).toContain('Live weather loads for <span class="font-semibold">Tauranga, Bay of Plenty</span>');
    expect(out).toMatch(/<p role="status"[^>]*data-testid="weather-loading"[^>]*>.*Loading live weather for Tauranga, Bay of Plenty…<\/p>/);
    expect(section(out, "weather-verdict")).toMatch(/^<section[^>]*aria-busy="true"/);
    const device = section(out, "weather-device-location");
    expect(device).toMatch(/^<button[^>]*disabled=""[^>]*aria-busy="true"/);
    expect(device).toContain("Use my device location");
  });

  it("ready at the job site: the call, where it's for, the source, and the next five days", () => {
    const out = STATES.ready;
    const { result } = READY;
    const verdict = section(out, "weather-verdict");
    expect(verdict).toMatch(new RegExp(`^<section[^>]*data-status="${result.overall_status}"`));
    expect(verdict).toContain(">Use caution</h2>");
    expect(verdict).toContain(result.weather_summary);
    expect(verdict).toContain("Weather for: Job site: Tauranga, Bay of Plenty");
    expect(verdict).toContain(">Open-Meteo</span>");
    expect(verdict).toContain(">Observed ");
    expect(verdict).not.toContain('aria-busy="true"');
    // Why, what to do, and when it looks better.
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const reason of result.reasons) expect(section(out, "weather-why")).toContain(reason);
    for (const control of result.controls) expect(section(out, "weather-actions")).toContain(control);
    expect(result.next_better_window).toBeTruthy();
    expect(section(out, "weather-better-window")).toContain(String(result.next_better_window));
    // Five days: Today, Tomorrow, then the weekday; rain, strong gusts, highs and lows.
    const days = section(out, "weather-5day");
    expect(days.match(/data-day="/g)).toHaveLength(5);
    expect(days).toContain("Next 5 days");
    expect(days).toContain("Job site: Tauranga, Bay of Plenty");
    expect(days).toContain(">Today</span>");
    expect(days).toContain(">Tomorrow</span>");
    expect(days).toContain(">Mon</span>");
    expect(days).toContain(">Light rain</span>");
    expect(days).toContain(">Thunderstorms</span>");
    expect(days).toContain("Rain 60%");
    expect(days).toContain("Gusts 72 kph");
    expect(days).not.toContain("Gusts 38 kph");
    expect(days).toContain(">16°</span> <span class=\"text-ui-muted\">9°</span>");
    expect(days).toContain(">15°</span> <span class=\"text-ui-muted\">—</span>");
    // The numbers behind the call, in the boxes.
    const conditions = section(out, "weather-conditions");
    expect(conditions).toContain('value="14.4"');
    expect(conditions).toContain('value="38"');
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain("weather-loading");
    // Live weather's licence (CC BY 4.0) asks for the credit.
    expect(out).toMatch(/data-testid="weather-credit"[^>]*>Weather data by Open-Meteo\.com \(CC BY 4\.0\)</);
  });

  it("your trade: every trade as a chip with a big tap area, yours picked, and the call follows it", () => {
    const w = state({ fetchState: "ready", trade: "painting_exterior", weather: LIVE, locationFor: "Job site: Tauranga" });
    const out = view(w);
    const chips = section(out, "weather-trade-picker");
    expect(chips.match(/role="radio"/g)).toHaveLength(TRADE_OPTIONS.length);
    for (const option of TRADE_OPTIONS) expect(chips).toContain(`data-trade="${option.value}"`);
    expect(chips).toMatch(/role="radio" aria-checked="true" data-trade="painting_exterior"[^>]*min-h-11[^>]*>Painting/);
    expect(chips).toMatch(/role="radio" aria-checked="false" data-trade="roofing"/);
    // Rain on fresh exterior paint stops the job.
    expect(w.result.overall_status).toBe("unsafe");
    expect(section(out, "weather-verdict")).toContain(">Not safe to work</h2>");
  });

  it("lightning: not safe to work, and the switch shows it's on", () => {
    const out = STATES.lightning;
    expect(section(out, "weather-verdict")).toMatch(/^<section[^>]*data-status="unsafe"/);
    expect(out).toContain(">Not safe to work</h2>");
    expect(out).toContain("Lightning or thunderstorm risk is present for outdoor work.");
    expect(switchAfter(out, "Lightning / thunderstorm risk")).toContain('aria-checked="true"');
  });

  it("calm and complete: safe to work, with nothing blocked", () => {
    const out = STATES.safe;
    expect(section(out, "weather-verdict")).toMatch(/^<section[^>]*data-status="safe"/);
    expect(out).toContain(">Safe to work</h2>");
    // The weather sheet's words, not the engine's.
    expect(section(out, "weather-why")).toContain("No weather limits right now.");
    expect(out).not.toContain("deterministic");
    expect(section(out, "weather-blocked")).toContain("No blocked tasks from weather rules.");
  });

  it("couldn't load the job site's weather: the reason, read out, and Retry job-site weather", () => {
    const out = STATES["job-site error"];
    const alert = out.slice(out.indexOf('<div role="alert">'));
    expect(alert).toContain('data-tone="warn"');
    expect(alert).toContain("Weather provider returned 503");
    expect(section(alert, "weather-retry-job")).toContain("Retry job-site weather");
  });

  it("device location that failed, no job picked: the reason, and no job-site retry", () => {
    const out = STATES["device error"];
    expect(out).toContain('<div role="alert">');
    expect(out).toContain("Could not load weather.");
    expect(out).not.toContain("weather-retry-job");
  });

  it("on the phone's location: says it isn't the job site", () => {
    const out = STATES["device location"];
    expect(section(out, "weather-verdict")).toContain("Weather for: Your device location (not the job site)");
    expect(section(out, "weather-5day")).toContain("Your device location (not the job site)");
    expect(out).not.toContain("Live weather loads for");
  });

  it("a job whose address couldn't be placed on the map: says so, with the ways forward", () => {
    const out = STATES["address not placed"];
    expect(out).toContain('<option value="q-2" selected="">New fence');
    expect(out).toContain("Couldn&#x27;t place this job&#x27;s address on the map.");
    expect(out).toContain("use your device location below (clearly marked as not the job site)");
  });

  it("parked for this account: says so, with a way back Home", () => {
    const out = STATES.parked;
    expect(out).toContain('data-testid="weather-parked"');
    expect(out).toContain("Weather impact is in owner testing");
    expect(out).toMatch(/<a [^>]*href="\/app"[^>]*>(?:(?!<\/a>).)*Back to Home/);
    expect(out).not.toContain("weather-check");
  });

  it.each(Object.entries(STATES))("%s follows the design rules", (_name, out) => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  const dir = join(process.cwd(), "src/app/app/weather/_newlook");
  const files = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));

  it("covers both new files", () => {
    expect([...files].sort()).toEqual(["WeatherImpact.tsx", "WeatherScreen.tsx"]);
  });

  it.each(files)("%s follows the design rules in its source", (name) => {
    expect(sourceRuleBreaks(readFileSync(join(dir, name), "utf8"))).toEqual([]);
  });
});

describe("the new-look page and the weather sheet share your trade", () => {
  const store = (value: string | null): StorageLike => ({
    getItem: () => value,
    setItem: () => {},
  });

  it("starts on the trade picked in the sheet, when one was", () => {
    expect(rememberedTrade(store("painting_exterior"))).toBe("painting_exterior");
    expect(rememberedTrade(store(null))).toBeNull();
    expect(rememberedTrade(store("not-a-trade"))).toBeNull();
    expect(rememberedTrade(null)).toBeNull();
  });

  it("any reason other than the all-clear stays as the engine wrote it", () => {
    expect(plainReasons(["Gusts over 40 km/h."])).toEqual(["Gusts over 40 km/h."]);
  });
});
