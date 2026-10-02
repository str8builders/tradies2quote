// ── Geocoding adapter ──────────────────────────────────────────────────────
// Turns a free-text site address into lat/lon for the forecast call. v1 uses
// Open-Meteo's free geocoding (place-name search, no key). Street-level NZ
// addresses geocode weakly, so we fall back to the most specific place token
// (suburb / town / city) we can extract. If nothing resolves, the caller
// records "location unknown" and SKIPS assessment rather than guessing — the
// system never fabricates a location.

import "server-only";
import { openMeteoUrl } from "@/lib/open-meteo-endpoint";

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  timezone: string | null;
  matchedName: string;
}

interface OpenMeteoGeoResponse {
  results?: Array<{
    latitude: number;
    longitude: number;
    timezone?: string;
    name?: string;
    admin1?: string;
    country?: string;
  }>;
}

export interface GeocodeArgs {
  address: string;
  /**
   * The business's own country — "NZ" | "AU" | "UK" | "US" | "CA" (the app's
   * `profiles.country` convention, see src/lib/quote-defaults.ts) or a raw
   * ISO-3166-1 alpha-2 code. A common town name ("Richmond", "Hamilton",
   * "Cambridge", "Palmerston") exists in more than one of our markets, so
   * without this a job address can silently resolve to the wrong country's
   * town. Best-effort, not a hard filter: a same-country match is preferred,
   * but when there isn't one the unfiltered fallback below still resolves a
   * genuinely cross-border job address rather than reporting "unknown".
   */
  country?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * The app stores "UK" (see COUNTRY_TAX_DEFAULTS in quote-defaults.ts) but the
 * assigned ISO-3166-1 alpha-2 code — what Open-Meteo's `countryCode` filter
 * expects — is "GB" ("UK" is only exceptionally reserved). Everything else
 * the app uses (NZ/AU/US/CA) already is its own ISO code. Anything that
 * isn't a plausible 2-letter code is ignored rather than sent, so a stray
 * value can never break the query.
 */
export function openMeteoCountryCode(country: string | null | undefined): string | null {
  const c = (country ?? "").trim().toUpperCase();
  if (!c) return null;
  if (c === "UK") return "GB";
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

/**
 * Best-effort geocode. Tries progressively coarser tokens of the address
 * (e.g. "Upper Hutt", then "Wellington") until one resolves, preferring a
 * match in the business's own country when one is given. Returns null if
 * nothing resolves — the caller must treat null as "cannot assess", not as
 * a default.
 */
export async function geocodeAddress(args: GeocodeArgs): Promise<GeocodeResult | null> {
  const doFetch = args.fetchImpl ?? fetch;
  const queries = candidateQueries(args.address);
  const countryCode = openMeteoCountryCode(args.country);

  const search = async (withCountry: boolean): Promise<GeocodeResult | null> => {
    for (const query of queries) {
      const params = new URLSearchParams({ name: query, count: "1", language: "en", format: "json" });
      if (withCountry && countryCode) params.set("countryCode", countryCode);
      let res: Response;
      try {
        res = await doFetch(openMeteoUrl("geocoding", params), { signal: args.signal });
      } catch {
        continue;
      }
      if (!res.ok) continue;
      const data = (await res.json()) as OpenMeteoGeoResponse;
      const hit = data.results?.[0];
      if (hit) {
        return {
          latitude: hit.latitude,
          longitude: hit.longitude,
          timezone: hit.timezone ?? null,
          matchedName: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
        };
      }
    }
    return null;
  };

  if (countryCode) {
    const inCountry = await search(true);
    if (inCountry) return inCountry;
  }
  return search(false);
}

/**
 * Derive search candidates from a free-text address, coarsest-meaningful first.
 * "12 Example Street, Upper Hutt, Wellington, NZ" →
 *   ["Upper Hutt, Wellington", "Upper Hutt", "Wellington"]
 * We skip the street-number segment (token 0) because the place-name geocoder
 * can't use it and it only pollutes the query.
 */
export function candidateQueries(address: string): string[] {
  const parts = address
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^(new zealand|nz|australia|au|aus|united kingdom|uk|usa|us|canada|ca)$/i.test(p));
  // Drop a leading street segment that contains a number (e.g. "12 Example St").
  const placeParts = (parts.length > 1 && /\d/.test(parts[0]) ? parts.slice(1) : parts)
    // NZ/AU addresses glue the postcode to the locality inside one comma
    // segment ("Mount Maunganui 3116") and the place-name geocoder returns
    // nothing for that — strip a trailing 3-5 digit postcode from each part.
    .map((p) => p.replace(/\s+\d{3,5}$/, "").trim())
    .filter((p) => p.length > 0);
  const candidates: string[] = [];
  if (placeParts.length >= 2) candidates.push(`${placeParts[0]}, ${placeParts[1]}`);
  for (const p of placeParts) candidates.push(p);
  // De-dup while preserving order.
  return [...new Set(candidates)].slice(0, 4);
}
