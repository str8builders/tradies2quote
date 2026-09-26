// The top bar's weather as static HTML (node): the button in each state,
// the "Weather impact" sheet in each state, and the top bar that holds it.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../settings/new-look-actions", () => ({ setNewLookAction: vi.fn() }));

import type { HereWeather } from "@/lib/weather-impact/here";
import { TOP_BAR_FIXTURE } from "../lib/fixtures";
import { TabTopBar } from "./TabTopBar";
import { WeatherButtonView } from "./WeatherButton";
import { WeatherSheet, type WeatherSheetProps } from "./WeatherSheet";
import type { WeatherReading, WeatherState } from "./weather-now";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const openTag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
const noop = () => {};

const WEATHER: HereWeather = {
  current: { summary: "Rain/showers", condition: "drizzle", temperatureC: 14.4, windGustKph: 38.2, rainProbabilityPct: 60 },
  days: [
    { date: "2026-09-26", status: "caution", condition: "rain", tempMaxC: 16, rainProbabilityMaxPct: 60, windGustMaxKph: 38, reason: "Gusts 38 kph" },
    { date: "2026-09-27", status: "safe", condition: "clear", tempMaxC: 18.4, rainProbabilityMaxPct: 5, windGustMaxKph: 20, reason: "Good to work" },
    { date: "2026-09-28", status: "unsafe", condition: "thunderstorm", tempMaxC: 13, rainProbabilityMaxPct: 90, windGustMaxKph: 70, reason: "Gusts 70 kph" },
    { date: "2026-09-29", status: "safe", condition: "cloud", tempMaxC: 15, rainProbabilityMaxPct: 20, windGustMaxKph: 25, reason: "Good to work" },
    { date: "2026-09-30", status: "safe", condition: "fog", tempMaxC: 14, rainProbabilityMaxPct: 10, windGustMaxKph: 15, reason: "Good to work" },
  ],
  trades: [
    { id: "roofing", label: "Roofing", status: "unsafe", reason: "Wind gusts are 38 kph, too high for roof work.", betterWindow: "Sat 2:00 pm-Sat 4:00 pm looks better: gusts around 20 kph and rain about 10%." },
    { id: "painting_exterior", label: "Painting (exterior)", status: "caution", reason: "Rain may affect the finish.", betterWindow: null },
    { id: "general_outdoor", label: "General outdoor labour", status: "caution", reason: "Wind gusts are 38 kph, enough to affect handling and balance.", betterWindow: null },
  ],
};

const reading = (over: Partial<WeatherReading> = {}): WeatherReading => ({
  source: "base",
  key: "base",
  locality: "Tauranga",
  at: Date.parse("2026-09-26T09:00:00+12:00"),
  weather: WEATHER,
  ...over,
});
const readyState = (over: Partial<WeatherReading> = {}): WeatherState => ({ kind: "ready", today: "2026-09-26", reading: reading(over) });

const button = (state: WeatherState, trade: "roofing" | "general_outdoor" = "general_outdoor") =>
  html(<WeatherButtonView state={state} trade={trade} open={false} onOpen={noop} />);

const sheet = (state: WeatherState, over: Partial<WeatherSheetProps> = {}) =>
  html(
    <WeatherSheet
      open
      onClose={noop}
      state={state}
      trade="general_outdoor"
      onTrade={noop}
      onRetry={noop}
      onUseLocation={noop}
      locating={false}
      notice={null}
      {...over}
    />,
  );

describe("the weather button", () => {
  it("ready: the condition, the temperature and a dot for your trade's call, with a full label", () => {
    const out = button(readyState());
    const tag = openTag(out, 'data-testid="top-bar-weather"');
    expect(tag).toContain('data-state="ready"');
    expect(tag).toContain(
      'aria-label="Weather: 14 degrees, light rain, in Tauranga. Caution for general outdoor labour. Tap for the impact on today&#x27;s work."',
    );
    expect(tag).toContain('aria-haspopup="dialog"');
    expect(tag).toContain('aria-expanded="false"');
    expect(tag).toContain("min-h-12");
    expect(tag).toContain("min-w-12");
    expect(out).toContain(">14°</span>");
    expect(openTag(out, "data-call=")).toContain("bg-ui-warn");
  });

  it("the dot follows your trade: roofing here is a stop", () => {
    const out = button(readyState(), "roofing");
    expect(openTag(out, "data-call=")).toContain('data-call="unsafe"');
    expect(openTag(out, "data-call=")).toContain("bg-ui-bad");
    expect(out).toContain("Stop for roofing.");
  });

  it("no temperature reading: just the icon and the call", () => {
    const out = button({ kind: "ready", today: "2026-09-26", reading: reading({ weather: { ...WEATHER, current: { ...WEATHER.current, temperatureC: null } } }) });
    expect(out).not.toContain("°");
    expect(out).toContain('data-call="caution"');
  });

  it("loading: a placeholder that stops for reduced motion", () => {
    const out = button({ kind: "loading" });
    expect(out).toContain('data-state="loading"');
    expect(out).toContain("Weather: getting the forecast.");
    expect(out).toContain("animate-ui-pulse motion-reduce:animate-none");
    expect(out).not.toContain("data-call");
  });

  it("error: says so and offers to try again", () => {
    const out = button({ kind: "error" });
    expect(out).toContain('data-state="error"');
    expect(out).toContain('aria-label="Weather&#x27;s not available right now. Tap to try again."');
  });

  it("no location: offers yours", () => {
    const out = button({ kind: "none", reason: "no-address" });
    expect(out).toContain('data-state="none"');
    expect(out).toContain("Weather: no location yet. Tap to use your location.");
  });
});

describe("the Weather impact sheet", () => {
  it("ready at the business address: now, your trade first, the others, five days, and the ways out", () => {
    const out = sheet(readyState());
    expect(out).toContain(">Weather impact</h2>");
    expect(out).toContain("At your business address, Tauranga");
    // Now
    expect(out).toContain("Right now");
    expect(out).toContain(">14°</span>");
    expect(out).toContain("Light rain");
    expect(out).toContain("Gusts 38 kph · Rain chance 60%");
    // Your trade, picked, with its call and reason first
    const yours = out.slice(out.indexOf('data-testid="weather-your-trade"'), out.indexOf('data-testid="weather-other-trades"'));
    expect(yours).toContain('data-call="caution"');
    // The trade picker: big tap buttons, yours filled in.
    expect(yours).toContain('data-testid="weather-trade-picker"');
    expect(yours).toMatch(/role="radio" aria-checked="true" data-trade="general_outdoor"[^>]*>General outdoor labour</);
    expect(yours).toMatch(/role="radio" aria-checked="false" data-trade="roofing"/);
    expect(yours).toContain("Caution");
    expect(yours).toContain("enough to affect handling and balance");
    expect(out.indexOf("weather-your-trade")).toBeLessThan(out.indexOf("weather-other-trades"));
    // Every other trade with a pill and its reason
    const others = out.slice(out.indexOf('data-testid="weather-other-trades"'));
    expect(others.match(/data-trade="/g)).toHaveLength(2);
    expect(others).toMatch(/data-trade="roofing" data-call="unsafe"/);
    expect(others).toContain("too high for roof work");
    expect(others).toContain(">Stop</span>");
    // Five days
    const days = out.slice(out.indexOf('data-testid="weather-days"'));
    expect(days.match(/data-day="/g)).toHaveLength(5);
    expect(days).toContain(">Today</span>");
    expect(days).toContain(">Tomorrow</span>");
    expect(days).toContain(">Mon</span>");
    expect(days).toContain("Gusts 70 kph");
    expect(out).toContain("Next 5 days");
    // Not on the phone's location: offer it
    expect(out).toContain('data-testid="weather-use-location"');
    expect(out).toContain('href="/app/weather"');
    expect(out).toContain("Full weather");
    expect(out).toContain("Advisory only");
  });

  it("your trade's better window, when it has one", () => {
    const out = sheet(readyState(), { trade: "roofing" });
    expect(out).toMatch(/role="radio" aria-checked="true" data-trade="roofing"[^>]*>Roofing</);
    expect(out).toContain('data-testid="weather-better-window"');
    expect(out).toContain("Sat 2:00 pm-Sat 4:00 pm looks better");
    expect(sheet(readyState())).not.toContain("weather-better-window");
  });

  it("on the phone's location: says so, no Use my location", () => {
    const out = sheet(readyState({ source: "device", key: "-37.69,176.17", locality: null }));
    expect(out).toContain("Where you are now");
    expect(out).not.toContain("weather-use-location");
  });

  it("Use my location that couldn't find you: says why", () => {
    const out = sheet(readyState(), { notice: "Your phone couldn't find you." });
    expect(out).toMatch(/<p role="alert"[^>]*>Your phone couldn&#x27;t find you.<\/p>/);
    expect(sheet(readyState(), { locating: true })).toContain("Finding you…");
  });

  it("error: Weather's not available right now, with Try again", () => {
    const out = sheet({ kind: "error" });
    expect(out).toContain("Weather&#x27;s not available right now");
    expect(out).toContain('data-testid="weather-retry"');
    expect(out).toContain('href="/app/weather"');
  });

  it("no location: add the business address or use the phone's", () => {
    const out = sheet({ kind: "none", reason: "no-address" });
    expect(out).toContain("No location for the weather yet");
    expect(out).toContain('data-testid="weather-use-location"');
    expect(out).toContain('href="/app/settings/business"');
    expect(out).toContain("Add your business address");
    const lost = sheet({ kind: "none", reason: "not-found" });
    expect(lost).toContain("We couldn&#x27;t find your business address on the map");
    expect(lost).toContain("Check your business address");
  });

  it("loading: busy, with placeholders", () => {
    const out = sheet({ kind: "loading" });
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("Getting the weather…");
  });

  it("closed: nothing inside is drawn", () => {
    expect(sheet(readyState(), { open: false })).not.toContain("Right now");
  });
});

describe("TabTopBar: the weather, top right", () => {
  it("shown when weather impact is on for the account, after the heading", () => {
    const out = html(<TabTopBar data={{ ...TOP_BAR_FIXTURE, weather: true }} title="Jobs" />);
    expect(out).toContain('data-testid="top-bar-weather"');
    expect(out.indexOf("<h1")).toBeLessThan(out.indexOf('data-testid="top-bar-weather"'));
    // Nothing is known on the server: it paints as loading, then fills in.
    expect(openTag(out, 'data-testid="top-bar-weather"')).toContain('data-state="loading"');
  });

  it("left out when it's parked (or not given)", () => {
    expect(html(<TabTopBar data={{ ...TOP_BAR_FIXTURE, weather: false }} title="Jobs" />)).not.toContain("top-bar-weather");
    expect(html(<TabTopBar data={TOP_BAR_FIXTURE} />)).not.toContain("top-bar-weather");
  });
});

describe("the town next to the weather", () => {
  it("shows where the forecast is for, beside the icon and in the words read out", () => {
    const state = readyState({ locality: "Tauranga" });
    const out = html(<WeatherButtonView state={state} trade="general_outdoor" open={false} onOpen={noop} />);
    expect(out).toContain('data-testid="weather-town"');
    expect(out).toContain(">Tauranga<");
    expect(out).toMatch(/aria-label="Weather: 14 degrees, [^"]*in Tauranga\./);
  });

  it("no town, no gap", () => {
    const out = html(<WeatherButtonView state={readyState({ locality: null })} trade="general_outdoor" open={false} onOpen={noop} />);
    expect(out).not.toContain('data-testid="weather-town"');
  });
});
