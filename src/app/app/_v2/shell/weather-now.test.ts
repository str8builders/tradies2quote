// The top bar's weather without a browser: where it's for, never asking for
// location on load, the session cache, your trade and the words.

import { describe, expect, it, vi } from "vitest";
import type { Fix } from "@/lib/location/fix";
import type { HereWeather } from "@/lib/weather-impact/here";
import {
  DEFAULT_TRADE,
  TRADE_KEY,
  WEATHER_TTL_MS,
  conditionNow,
  dayName,
  degrees,
  forgetBase,
  localDayKey,
  locationAlreadyAllowed,
  readTrade,
  resolveWeather,
  saveTrade,
  sourceLine,
  spotKey,
  tradeCall,
  upcomingDays,
  weatherButtonLabel,
  weatherFromPhone,
  type StorageLike,
  type WeatherDeps,
  type WeatherState,
} from "./weather-now";

const WEATHER: HereWeather = {
  current: { summary: "Rain/showers", condition: "drizzle", temperatureC: 14.4, windGustKph: 38, rainProbabilityPct: 60 },
  days: [
    { date: "2026-09-26", status: "caution", condition: "rain", tempMaxC: 16, rainProbabilityMaxPct: 60, windGustMaxKph: 38, reason: "Gusts 38 kph" },
    { date: "2026-09-27", status: "safe", condition: "clear", tempMaxC: 18, rainProbabilityMaxPct: 5, windGustMaxKph: 20, reason: "Good to work" },
  ],
  trades: [
    { id: "roofing", label: "Roofing", status: "caution", reason: "Wind gusts are 38 kph, close to the caution range for height work.", betterWindow: "Sat 2:00 pm-Sat 4:00 pm looks better: gusts around 20 kph and rain about 10%." },
    { id: "general_outdoor", label: "General outdoor labour", status: "safe", reason: "No weather limits right now.", betterWindow: null },
  ],
};

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)) };
}

const NOW = Date.parse("2026-09-26T09:00:00+12:00");

type Reply = { ok: boolean; status: number; body: unknown };

/** The browser, faked: location off by default, the phone in Tauranga, both APIs answering. */
function deps({
  clock = { t: NOW },
  allowed = false,
  fix = { lat: -37.68679, lng: 176.16543, acc: 12 },
  reply,
  storage = memoryStorage(),
}: { clock?: { t: number }; allowed?: boolean; fix?: Fix | null; reply?: (url: string) => Reply; storage?: StorageLike | null } = {}) {
  return {
    storage,
    now: () => clock.t,
    locationAllowed: vi.fn(async () => allowed),
    currentFix: vi.fn(async (): Promise<Fix | null> => fix),
    getJson: vi.fn(
      async (url: string): Promise<Reply> =>
        reply?.(url) ??
        (url.startsWith("/api/weather/base")
          ? { ok: true, status: 200, body: { ...WEATHER, locality: "Tauranga" } }
          : { ok: true, status: 200, body: WEATHER }),
    ),
  } satisfies WeatherDeps;
}

const ready = (state: WeatherState) => {
  if (state.kind !== "ready") throw new Error(`expected ready, got ${state.kind}`);
  return state;
};

describe("resolveWeather: where the forecast is for", () => {
  it("location not allowed: the business address, and the phone is never asked", async () => {
    const d = deps();
    const state = ready(await resolveWeather(d));
    expect(state.reading).toMatchObject({ source: "base", key: "base", locality: "Tauranga" });
    expect(state.reading.weather.trades).toHaveLength(2);
    expect(d.currentFix).not.toHaveBeenCalled();
    expect(d.getJson).toHaveBeenCalledWith("/api/weather/base");
  });

  it("location already allowed: where the phone is, sent rounded to about 1 km", async () => {
    const d = deps({ allowed: true });
    const state = ready(await resolveWeather(d));
    expect(state.reading).toMatchObject({ source: "device", key: "-37.69,176.17", locality: null });
    expect(d.getJson).toHaveBeenCalledWith("/api/weather/here?lat=-37.69&lng=176.17");
    expect(state.today).toBe(localDayKey(new Date(NOW)));
  });

  it("switching tabs: the session's copy, no fetch and no new fix", async () => {
    const d = deps({ allowed: true });
    await resolveWeather(d);
    const again = ready(await resolveWeather(d));
    expect(again.reading.source).toBe("device");
    expect(d.getJson).toHaveBeenCalledTimes(1);
    expect(d.currentFix).toHaveBeenCalledTimes(1);
  });

  it("after 30 minutes it's looked up again", async () => {
    const clock = { t: NOW };
    const d = deps({ clock });
    await resolveWeather(d);
    clock.t = NOW + WEATHER_TTL_MS + 1000;
    await resolveWeather(d);
    expect(d.getJson).toHaveBeenCalledTimes(2);
  });

  it("location allowed since the last look: moves from the business address to the phone", async () => {
    const d = deps();
    await resolveWeather(d);
    d.locationAllowed.mockResolvedValue(true);
    expect(ready(await resolveWeather(d)).reading.source).toBe("device");
  });

  it("allowed, but the phone can't find itself: the business address, and it doesn't wait on the phone every tab", async () => {
    const d = deps({ allowed: true, fix: null });
    expect(ready(await resolveWeather(d)).reading.source).toBe("base");
    expect(ready(await resolveWeather(d)).reading.source).toBe("base");
    expect(d.currentFix).toHaveBeenCalledTimes(1);
    expect(d.getJson).toHaveBeenCalledTimes(1);
  });

  it("no business address: none, kept for the session too", async () => {
    const d = deps({ reply: () => ({ ok: false, status: 404, body: { reason: "no-address" } }) });
    expect(await resolveWeather(d)).toEqual({ kind: "none", reason: "no-address" });
    expect(await resolveWeather(d)).toEqual({ kind: "none", reason: "no-address" });
    expect(d.getJson).toHaveBeenCalledTimes(1);
  });

  it("no address is only kept a few minutes, and forgotten when you go to add it", async () => {
    const clock = { t: NOW };
    const d = deps({ clock, reply: () => ({ ok: false, status: 404, body: { reason: "no-address" } }) });
    await resolveWeather(d);
    clock.t = NOW + 6 * 60 * 1000;
    await resolveWeather(d);
    expect(d.getJson).toHaveBeenCalledTimes(2);
    forgetBase(d.storage);
    await resolveWeather(d);
    expect(d.getJson).toHaveBeenCalledTimes(3);
  });

  it("an address that isn't on the map: none, not-found", async () => {
    const d = deps({ reply: () => ({ ok: false, status: 404, body: { reason: "not-found" } }) });
    expect(await resolveWeather(d)).toEqual({ kind: "none", reason: "not-found" });
  });

  it("the service failing or offline: error, and not kept", async () => {
    const d = deps({ reply: () => ({ ok: false, status: 502, body: { error: "x" } }) });
    expect(await resolveWeather(d)).toEqual({ kind: "error" });
    d.getJson.mockResolvedValue({ ok: false, status: 0, body: null });
    expect(await resolveWeather(d)).toEqual({ kind: "error" });
    expect(d.getJson).toHaveBeenCalledTimes(2);
  });

  it("a reply that isn't a forecast: error", async () => {
    const d = deps({ reply: () => ({ ok: true, status: 200, body: { hello: 1 } }) });
    expect(await resolveWeather(d)).toEqual({ kind: "error" });
  });

  it("Try again skips the session's copy", async () => {
    const d = deps();
    await resolveWeather(d);
    await resolveWeather(d, { fresh: true });
    expect(d.getJson).toHaveBeenCalledTimes(2);
  });

  it("storage that throws (private browsing): still works, just not kept", async () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const d = deps({ storage: broken });
    expect(ready(await resolveWeather(d)).reading.source).toBe("base");
  });

  it("a stale or damaged session copy is ignored", async () => {
    const storage = memoryStorage({ "t2q-weather:last": "base", "t2q-weather:base": "{not json" });
    const d = deps({ storage });
    await resolveWeather(d);
    expect(d.getJson).toHaveBeenCalledTimes(1);
  });
});

describe("Use my location", () => {
  it("the phone's forecast once it finds you", async () => {
    const d = deps();
    const state = await weatherFromPhone(d);
    expect(state && ready(state).reading.source).toBe("device");
    // ...and the next tab shows it without asking again.
    d.locationAllowed.mockResolvedValue(true);
    expect(ready(await resolveWeather(d)).reading.source).toBe("device");
    expect(d.getJson).toHaveBeenCalledTimes(1);
  });

  it("null when the phone couldn't find you (the sheet says so)", async () => {
    expect(await weatherFromPhone(deps({ fix: null }))).toBeNull();
  });
});

describe("locationAlreadyAllowed (never asks)", () => {
  const web = (state: string) => ({ query: vi.fn(async () => ({ state })) });

  it("the iPhone app: only always or while using", async () => {
    for (const [status, allowed] of [["always", true], ["whenInUse", true], ["notDetermined", false], ["denied", false], ["restricted", false]] as const) {
      expect(await locationAlreadyAllowed({ native: true, nativePermission: async () => ({ status }), permissions: web("granted") })).toBe(allowed);
    }
  });

  it("a browser: only when the permission is granted already", async () => {
    const noNative = async () => ({ status: "always" });
    expect(await locationAlreadyAllowed({ native: false, nativePermission: noNative, permissions: web("granted") })).toBe(true);
    expect(await locationAlreadyAllowed({ native: false, nativePermission: noNative, permissions: web("prompt") })).toBe(false);
    expect(await locationAlreadyAllowed({ native: false, nativePermission: noNative, permissions: undefined })).toBe(false);
    const broken = { query: async () => Promise.reject(new TypeError("geolocation not supported")) };
    expect(await locationAlreadyAllowed({ native: false, nativePermission: noNative, permissions: broken })).toBe(false);
  });
});

describe("your trade", () => {
  it("remembered on this device (the old dashboard's key), else general outdoor labour", () => {
    const local = memoryStorage();
    expect(readTrade(local)).toBe(DEFAULT_TRADE);
    saveTrade(local, "roofing");
    expect(local.data[TRADE_KEY]).toBe("roofing");
    expect(readTrade(local)).toBe("roofing");
    expect(readTrade(memoryStorage({ [TRADE_KEY]: "juggling" }))).toBe(DEFAULT_TRADE);
    expect(readTrade(null)).toBe(DEFAULT_TRADE);
  });

  it("its call, else general outdoor labour's", () => {
    expect(tradeCall(WEATHER, "roofing")?.status).toBe("caution");
    expect(tradeCall(WEATHER, "concrete_slab")?.id).toBe("general_outdoor");
  });
});

describe("the words", () => {
  const readyState = (over: Partial<HereWeather["current"]> = {}): WeatherState => ({
    kind: "ready",
    today: "2026-09-26",
    reading: { source: "base", key: "base", locality: "Tauranga", at: NOW, weather: { ...WEATHER, current: { ...WEATHER.current, ...over } } },
  });

  it("the button's label in every state", () => {
    expect(weatherButtonLabel(readyState(), "roofing")).toBe(
      "Weather: 14 degrees, light rain, in Tauranga. Caution for roofing. Tap for the impact on today's work.",
    );
    expect(weatherButtonLabel(readyState({ temperatureC: null, condition: null }), "general_outdoor")).toBe(
      "Weather: rain, in Tauranga. Safe for general outdoor labour. Tap for the impact on today's work.",
    );
    expect(weatherButtonLabel({ kind: "loading" }, "roofing")).toBe("Weather: getting the forecast. Tap for the impact on today's work.");
    expect(weatherButtonLabel({ kind: "error" }, "roofing")).toBe("Weather's not available right now. Tap to try again.");
    expect(weatherButtonLabel({ kind: "none", reason: "no-address" }, "roofing")).toBe("Weather: no location yet. Tap to use your location.");
  });

  it("the condition now, else today's", () => {
    expect(conditionNow(WEATHER, "2026-09-26")).toBe("drizzle");
    expect(conditionNow({ ...WEATHER, current: { ...WEATHER.current, condition: null } }, "2026-09-27")).toBe("clear");
  });

  it("where it's for", () => {
    const base = { source: "base" as const, key: "base", locality: "Tauranga", at: NOW, weather: WEATHER };
    expect(sourceLine(base)).toBe("At your business address, Tauranga");
    expect(sourceLine({ ...base, locality: null })).toBe("At your business address");
    expect(sourceLine({ ...base, source: "device", key: "-37.69,176.17" })).toBe("Where you are now, Tauranga");
    expect(sourceLine({ ...base, source: "device", key: "-37.69,176.17", locality: null })).toBe("Where you are now");
  });

  it("days, degrees and the spot", () => {
    expect(dayName("2026-09-26", "2026-09-26")).toBe("Today");
    expect(dayName("2026-09-27", "2026-09-26")).toBe("Tomorrow");
    expect(dayName("2026-09-28", "2026-09-26")).toBe("Mon");
    expect(upcomingDays(WEATHER.days, "2026-09-27").map((d) => d.date)).toEqual(["2026-09-27"]);
    expect(upcomingDays(WEATHER.days, "2026-10-09").map((d) => d.date)).toEqual(["2026-09-26", "2026-09-27"]);
    expect(degrees(14.4)).toBe("14°");
    expect(degrees(-0.4)).toBe("0°");
    expect(degrees(null)).toBeNull();
    expect(spotKey({ lat: -37.6, lng: 176 })).toBe("-37.60,176.00");
    expect(localDayKey(new Date(2026, 8, 6))).toBe("2026-09-06");
  });
});
