// ── Geocoding adapter ──────────────────────────────────────────────────────
// Turns a free-text site address into lat/lon for the forecast call. v1 uses
// Open-Meteo's free geocoding (place-name search, no key). Street-level NZ
// addresses geocode weakly, so we fall back to the most specific place token
// (suburb / town / city) we can extract. If nothing resolves, the caller
// records "location unknown" and SKIPS assessment rather than guessing — the
// system never fabricates a location.

import "server-only";

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

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
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Best-effort geocode. Tries progressively coarser tokens of the address
 * (e.g. "Upper Hutt", then "Wellington") until one resolves. Returns null if
 * none do — the caller must treat null as "cannot assess", not as a default.
 */
export async function geocodeAddress(args: GeocodeArgs): Promise<GeocodeResult | null> {
  const doFetch = args.fetchImpl ?? fetch;
  for (const query of candidateQueries(args.address)) {
    const params = new URLSearchParams({ name: query, count: "1", language: "en", format: "json" });
    let res: Response;
    try {
      res = await doFetch(`${GEOCODE_URL}?${params}`, { signal: args.signal });
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
