/**
 * Where Open-Meteo requests go (server), and the credit the pages show.
 *
 * Open-Meteo's free hosts are for non-commercial use only. Tradies2Quote is a
 * commercial product, so the licensed way is one of Open-Meteo's paid API
 * plans: it gives an API key and "customer-" hosts. That matters for the App
 * Store too: App Store Connect asks whether you have the rights to third-party
 * content the app shows (Guideline 5.2).
 *
 * With OPEN_METEO_API_KEY set (in /srv/t2q/app.env), every request goes to the
 * customer host with the key; without it, to the free host as before, so the
 * weather keeps working until the key is added. The key is read here on the
 * server and never reaches a page.
 *
 * The data itself is CC BY 4.0: the app credits it where the forecast shows
 * (OPEN_METEO_CREDIT).
 */

export type OpenMeteoApi = "forecast" | "geocoding";

const FREE: Readonly<Record<OpenMeteoApi, string>> = {
  forecast: "https://api.open-meteo.com/v1/forecast",
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
};

const PAID: Readonly<Record<OpenMeteoApi, string>> = {
  forecast: "https://customer-api.open-meteo.com/v1/forecast",
  geocoding: "https://customer-geocoding-api.open-meteo.com/v1/search",
};

type Env = Readonly<Record<string, string | undefined>>;

/** The commercial-use key, when the paid plan is set up. */
function apiKey(env: Env): string | null {
  const key = env.OPEN_METEO_API_KEY?.trim();
  return key ? key : null;
}

/** True once the paid (commercial-use) plan's key is configured. */
export function openMeteoCommercial(env: Env = process.env): boolean {
  return apiKey(env) !== null;
}

/** The full request URL for an Open-Meteo API with these query parameters. */
export function openMeteoUrl(api: OpenMeteoApi, params: URLSearchParams, env: Env = process.env): string {
  const key = apiKey(env);
  if (!key) return `${FREE[api]}?${params}`;
  const withKey = new URLSearchParams(params);
  withKey.set("apikey", key);
  return `${PAID[api]}?${withKey}`;
}

/** The credit the CC BY 4.0 licence asks for, shown under the forecast. */
export const OPEN_METEO_CREDIT = "Weather data by Open-Meteo.com (CC BY 4.0)";

/** `source` on a live reading (weather-impact/open-meteo.ts): the pages credit it. */
export const OPEN_METEO_SOURCE = "Open-Meteo";
