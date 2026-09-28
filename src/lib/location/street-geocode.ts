import "server-only";
import { isValidLatLng } from "./geo";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Nominatim's policy: say who we are, and no more than one request a second. */
const USER_AGENT = "Tradies2Quote/1.0 (support@tradies2quote.com)";
const COUNTRY: Record<string, string> = { NZ: "nz", AU: "au", GB: "gb", UK: "gb", US: "us", CA: "ca" };

export type StreetLookup =
  | { point: { lat: number; lng: number } }
  /** "not_found": no street-level match (only a town, say). "error": the service didn't answer properly. */
  | { miss: "not_found" | "error" };

/**
 * A street address to a point, from OpenStreetMap (street level, unlike the
 * weather's place-name lookup), or why not: nothing close enough was found
 * (then the site is pinned from a phone on site), or the service had
 * trouble (worth trying again sooner).
 */
export async function lookUpStreet(
  address: string,
  { country, fetchImpl = fetch }: { country?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<StreetLookup> {
  const query = address.replace(/\s+/g, " ").trim();
  if (query.length < 6) return { miss: "not_found" };
  const params = new URLSearchParams({ q: query, format: "jsonv2", limit: "1", addressdetails: "0" });
  const code = COUNTRY[(country ?? "").toUpperCase()];
  if (code) params.set("countrycodes", code);
  try {
    const res = await fetchImpl(`${NOMINATIM}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { miss: "error" };
    const hits = (await res.json()) as Array<{ lat: string; lon: string; place_rank?: number }>;
    const hit = Array.isArray(hits) ? hits[0] : undefined;
    if (!hit) return { miss: "not_found" };
    // Street or better (rank 26+ is a street, 30 a building): a town centre is no use as a job site.
    if (typeof hit.place_rank === "number" && hit.place_rank < 26) return { miss: "not_found" };
    const point = { lat: Number(hit.lat), lng: Number(hit.lon) };
    return isValidLatLng(point) ? { point } : { miss: "not_found" };
  } catch {
    return { miss: "error" };
  }
}

/** A street address to a point, or null when it can't be found closely enough (see lookUpStreet). */
export async function geocodeStreet(
  address: string,
  options: { country?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<{ lat: number; lng: number } | null> {
  const found = await lookUpStreet(address, options);
  return "point" in found ? found.point : null;
}
