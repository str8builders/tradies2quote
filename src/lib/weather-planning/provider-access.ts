import "server-only";

/** Commercial credentials never enter browser or native bundles. */
export function weatherProviderURL(kind: "forecast" | "geocoding", params: URLSearchParams): URL {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  if (!key && process.env.NODE_ENV === "production") {
    throw new Error("Commercial weather service is not configured.");
  }
  const host = kind === "forecast" ? "api.open-meteo.com" : "geocoding-api.open-meteo.com";
  const url = new URL(`https://${key ? "customer-" : ""}${host}/v1/${kind === "forecast" ? "forecast" : "search"}`);
  url.search = params.toString();
  if (key) url.searchParams.set("apikey", key);
  return url;
}

export async function fetchWeatherProvider(kind: "forecast" | "geocoding", params: URLSearchParams, options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<Response> {
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    return await (options.fetchImpl ?? fetch)(weatherProviderURL(kind, params).toString(), { signal, cache: "no-store", redirect: "error" });
  } catch {
    // Provider URLs contain a secret. Never propagate URL-bearing fetch errors.
    throw new Error("The forecast service did not answer. Try again shortly.");
  }
}
