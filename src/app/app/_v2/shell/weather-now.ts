/**
 * The top bar's weather, minus the drawing: where it's for (the phone's
 * location when that's already allowed, else the business address), the
 * session cache that keeps tab switches instant, your trade, and the words.
 * Everything that touches the browser is passed in, so it's tested in node.
 */

import { formatWeekdayShort } from "@/lib/format-date";
import type { Fix } from "@/lib/location/fix";
import { addDays } from "@/lib/timesheet/week";
import { TRADE_PROFILES } from "@/lib/weather-impact/config";
import type { HereTrade, HereWeather } from "@/lib/weather-impact/here";
import type { DayOutlook } from "@/lib/weather-impact/outlook";
import type { WeatherImpactStatus, WeatherImpactTrade } from "@/lib/weather-impact/types";
import { pickToday } from "../lib/weather-line";

/** A forecast is kept this long for the session (the server caches the same). */
export const WEATHER_TTL_MS = 30 * 60 * 1000;
/** "No business address" is kept for less: it's fixed in a minute in Business details. */
const NONE_TTL_MS = 5 * 60 * 1000;
/** Your trade, remembered on this device (the same key as the old dashboard's weather card). */
export const TRADE_KEY = "t2q-weather-trade";
export const DEFAULT_TRADE: WeatherImpactTrade = "general_outdoor";

const PREFIX = "t2q-weather:";
/** The key of the forecast this session last showed. */
const LAST = `${PREFIX}last`;
/** When location was allowed but the phone couldn't find itself. */
const NO_FIX = `${PREFIX}nofix`;
const BASE = "base";

export type WeatherSource = "device" | "base";
/** No forecast to show: no business address, or it couldn't be found on the map. */
export type NoWeatherReason = "no-address" | "not-found";

/** One forecast as shown (and kept for the session). */
export interface WeatherReading {
  source: WeatherSource;
  /** "-37.69,176.17" (two decimals, about 1 km) or "base". */
  key: string;
  /** The business address's town ("Tauranga"); null for the phone's location. */
  locality: string | null;
  /** When it was fetched (ms). */
  at: number;
  weather: HereWeather;
}

export type WeatherState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "none"; reason: NoWeatherReason }
  /** `today`: the phone's calendar day when it was shown, for "Today" in the outlook. */
  | { kind: "ready"; reading: WeatherReading; today: string };

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** What resolving the weather needs from the browser (fakes in the tests). */
export interface WeatherDeps {
  /** sessionStorage, or null when the browser won't give it. */
  storage: StorageLike | null;
  now(): number;
  /** Location is already allowed: never asks. */
  locationAllowed(): Promise<boolean>;
  /** Where the phone is (may ask, so only call it once allowed or on a tap). */
  currentFix(): Promise<Fix | null>;
  /** GET a URL as JSON; never throws (status 0 when offline). */
  getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }>;
}

interface Stored {
  at: number;
  source: WeatherSource;
  key: string;
  locality: string | null;
  weather: HereWeather | null;
  none?: NoWeatherReason;
}

/** "YYYY-MM-DD" on this phone's calendar. */
export function localDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Two decimals, about 1 km: the cache key, and all the server is sent. */
export function spotKey(fix: Pick<Fix, "lat" | "lng">): string {
  const round = (v: number) => (Math.round(v * 100) / 100).toFixed(2);
  return `${round(fix.lat)},${round(fix.lng)}`;
}

export function isHereWeather(value: unknown): value is HereWeather {
  const v = value as Partial<HereWeather> | null;
  return Boolean(v && typeof v === "object" && v.current && typeof v.current === "object" && Array.isArray(v.days) && Array.isArray(v.trades));
}

function readStored(storage: StorageLike | null, key: string, now: number): Stored | null {
  try {
    const raw = storage?.getItem(PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored> | null;
    if (!v || typeof v.at !== "number" || v.at - now > 60_000) return null;
    if (now - v.at > (v.weather == null ? NONE_TTL_MS : WEATHER_TTL_MS)) return null;
    if (v.source !== "device" && v.source !== "base") return null;
    if (v.weather != null && !isHereWeather(v.weather)) return null;
    if (v.weather == null && v.none !== "no-address" && v.none !== "not-found") return null;
    return { at: v.at, source: v.source, key, locality: typeof v.locality === "string" ? v.locality : null, weather: v.weather ?? null, none: v.none };
  } catch {
    return null;
  }
}

function keep(storage: StorageLike | null, stored: Stored): void {
  try {
    storage?.setItem(PREFIX + stored.key, JSON.stringify(stored));
    storage?.setItem(LAST, stored.key);
    if (stored.source === "device") storage?.setItem(NO_FIX, "");
  } catch {
    // Full or blocked storage: it just fetches again next time.
  }
}

function lastShown(storage: StorageLike | null, now: number): Stored | null {
  try {
    const key = storage?.getItem(LAST);
    return key ? readStored(storage, key, now) : null;
  } catch {
    return null;
  }
}

/** The phone couldn't find itself in the last half hour (so don't wait on it again every tab). */
function missedFix(storage: StorageLike | null, now: number): boolean {
  try {
    const at = Number(storage?.getItem(NO_FIX) || NaN);
    return Number.isFinite(at) && now - at >= 0 && now - at <= WEATHER_TTL_MS;
  } catch {
    return false;
  }
}

function markMissedFix(storage: StorageLike | null, now: number): void {
  try {
    storage?.setItem(NO_FIX, String(now));
  } catch {
    // Not kept: it tries the phone again next time.
  }
}

function stateOf(stored: Stored, now: number): WeatherState {
  if (!stored.weather) return { kind: "none", reason: stored.none ?? "no-address" };
  const { at, source, key, locality, weather } = stored;
  return { kind: "ready", reading: { at, source, key, locality, weather }, today: localDayKey(new Date(now)) };
}

/** The forecast for where the phone is (from the session when it's fresh). */
async function weatherAt(deps: WeatherDeps, fix: Fix, fresh: boolean): Promise<WeatherState> {
  const now = deps.now();
  const key = spotKey(fix);
  const hit = fresh ? null : readStored(deps.storage, key, now);
  if (hit) {
    keep(deps.storage, hit);
    return stateOf(hit, now);
  }
  const [lat, lng] = key.split(",");
  const res = await deps.getJson(`/api/weather/here?lat=${lat}&lng=${lng}`);
  if (!res.ok || !isHereWeather(res.body)) return { kind: "error" };
  const { current, days, trades } = res.body;
  const town = (res.body as { locality?: unknown }).locality;
  const locality = typeof town === "string" && town.trim() ? town.trim() : null;
  const stored: Stored = { at: now, source: "device", key, locality, weather: { current, days, trades } };
  keep(deps.storage, stored);
  return stateOf(stored, now);
}

/** The forecast at the business address (from the session when it's fresh). */
async function weatherAtBase(deps: WeatherDeps, fresh: boolean): Promise<WeatherState> {
  const now = deps.now();
  const hit = fresh ? null : readStored(deps.storage, BASE, now);
  if (hit) {
    keep(deps.storage, hit);
    return stateOf(hit, now);
  }
  const res = await deps.getJson("/api/weather/base");
  const body = (res.body ?? {}) as { reason?: unknown; locality?: unknown };
  if (res.status === 404) {
    const none: NoWeatherReason = body.reason === "not-found" ? "not-found" : "no-address";
    const stored: Stored = { at: now, source: "base", key: BASE, locality: null, weather: null, none };
    keep(deps.storage, stored);
    return stateOf(stored, now);
  }
  if (!res.ok || !isHereWeather(res.body)) return { kind: "error" };
  const { current, days, trades } = res.body;
  const locality = typeof body.locality === "string" && body.locality.trim() ? body.locality.trim() : null;
  const stored: Stored = { at: now, source: "base", key: BASE, locality, weather: { current, days, trades } };
  keep(deps.storage, stored);
  return stateOf(stored, now);
}

/**
 * The weather to show, without ever asking for location: what this session
 * last showed while it's fresh (unless location has since been allowed or
 * taken away), else where the phone is when location is already allowed,
 * else the business address. `fresh` skips the session copy (Try again).
 */
export async function resolveWeather(deps: WeatherDeps, { fresh = false }: { fresh?: boolean } = {}): Promise<WeatherState> {
  const now = deps.now();
  const allowed = await deps.locationAllowed().catch(() => false);
  const usePhone = allowed && (fresh || !missedFix(deps.storage, now));
  if (!fresh) {
    const last = lastShown(deps.storage, now);
    if (last && (last.source === "device") === usePhone) return stateOf(last, now);
  }
  if (usePhone) {
    const fix = await deps.currentFix().catch(() => null);
    if (fix) return weatherAt(deps, fix, fresh);
    markMissedFix(deps.storage, deps.now());
  }
  return weatherAtBase(deps, fresh);
}

/** Off to add or fix the business address: look it up afresh when back. */
export function forgetBase(storage: StorageLike | null): void {
  try {
    storage?.setItem(PREFIX + BASE, "");
  } catch {
    // Not kept anyway.
  }
}

/** "Use my location": ask the phone (iOS asks for permission here, in context). Null when it couldn't find you. */
export async function weatherFromPhone(deps: WeatherDeps): Promise<WeatherState | null> {
  const fix = await deps.currentFix().catch(() => null);
  return fix ? weatherAt(deps, fix, false) : null;
}

/** Location already allowed, without asking: the iPhone app's own module, else the browser's permission. */
export async function locationAlreadyAllowed(env: {
  native: boolean;
  nativePermission: () => Promise<{ status: string }>;
  permissions: { query(descriptor: { name: "geolocation" }): Promise<{ state: string }> } | null | undefined;
}): Promise<boolean> {
  try {
    if (env.native) {
      const { status } = await env.nativePermission();
      return status === "always" || status === "whenInUse";
    }
    if (!env.permissions) return false;
    return (await env.permissions.query({ name: "geolocation" })).state === "granted";
  } catch {
    return false;
  }
}

export function isTrade(value: unknown): value is WeatherImpactTrade {
  return typeof value === "string" && Object.hasOwn(TRADE_PROFILES, value);
}

/** Your trade from this device, else general outdoor labour. */
export function readTrade(storage: StorageLike | null): WeatherImpactTrade {
  try {
    const value = storage?.getItem(TRADE_KEY);
    return isTrade(value) ? value : DEFAULT_TRADE;
  } catch {
    return DEFAULT_TRADE;
  }
}

export function saveTrade(storage: StorageLike | null, trade: WeatherImpactTrade): void {
  try {
    storage?.setItem(TRADE_KEY, trade);
  } catch {
    // Not kept on this device: it still changes for now.
  }
}

/** Your trade's call, else general outdoor labour's, else the first. */
export function tradeCall(weather: HereWeather, trade: WeatherImpactTrade): HereTrade | null {
  return weather.trades.find((t) => t.id === trade) ?? weather.trades.find((t) => t.id === DEFAULT_TRADE) ?? weather.trades[0] ?? null;
}

export const CALL_WORDS: Readonly<Record<WeatherImpactStatus, string>> = { safe: "Safe", caution: "Caution", unsafe: "Stop" };
export const CALL_TONE: Readonly<Record<WeatherImpactStatus, "ok" | "warn" | "bad">> = { safe: "ok", caution: "warn", unsafe: "bad" };

/** Plain words for each condition. */
export const CONDITION_WORDS: Readonly<Record<DayOutlook["condition"], string>> = {
  clear: "clear",
  cloud: "cloudy",
  drizzle: "light rain",
  rain: "rain",
  thunderstorm: "thunderstorms",
  fog: "fog",
  snow: "snow",
  changing: "changeable",
};

/** The condition right now, else today's, else changeable. */
export function conditionNow(weather: HereWeather, today: string): DayOutlook["condition"] {
  return weather.current.condition ?? pickToday(weather.days, today)?.condition ?? "changing";
}

/** "14°", or null with no reading. */
export function degrees(celsius: number | null | undefined): string | null {
  return celsius == null || !Number.isFinite(celsius) ? null : `${Math.round(celsius)}°`;
}

export function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "Today", "Tomorrow", then "Mon". */
export function dayName(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return formatWeekdayShort(date);
}

/** Today and the days after it (a forecast fetched before midnight still starts yesterday). */
export function upcomingDays(days: readonly DayOutlook[], today: string): DayOutlook[] {
  const ahead = days.filter((d) => d.date >= today);
  return (ahead.length > 0 ? ahead : days).slice(0, 5);
}

/** Where the forecast is for, under the sheet's title. */
export function sourceLine(reading: WeatherReading): string {
  if (reading.source === "device") return reading.locality ? `Where you are now, ${reading.locality}` : "Where you are now";
  return reading.locality ? `At your business address, ${reading.locality}` : "At your business address";
}

const TAP_FOR_IMPACT = "Tap for the impact on today's work.";

/** The button's name for screen readers, e.g. "Weather: 14 degrees, light rain. Caution for roofing. Tap for …". */
export function weatherButtonLabel(state: WeatherState, trade: WeatherImpactTrade): string {
  switch (state.kind) {
    case "loading":
      return `Weather: getting the forecast. ${TAP_FOR_IMPACT}`;
    case "error":
      return "Weather's not available right now. Tap to try again.";
    case "none":
      return "Weather: no location yet. Tap to use your location.";
    case "ready": {
      const { weather } = state.reading;
      const temp = weather.current.temperatureC;
      const now = [
        temp == null || !Number.isFinite(temp) ? null : `${Math.round(temp)} degrees`,
        CONDITION_WORDS[conditionNow(weather, state.today)],
        state.reading.locality ? `in ${state.reading.locality}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      const call = tradeCall(weather, trade);
      const verdict = call ? ` ${CALL_WORDS[call.status]} for ${call.label.toLowerCase()}.` : "";
      return `Weather: ${now}.${verdict} ${TAP_FOR_IMPACT}`;
    }
  }
}
