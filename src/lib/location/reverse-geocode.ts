import "server-only";

const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
/** Nominatim's policy: say who we are (callers cache per spot, so it's rarely asked). */
const USER_AGENT = "Tradies2Quote/1.0 (support@tradies2quote.com)";

type NominatimAddress = Partial<Record<"town" | "village" | "city" | "suburb" | "hamlet" | "municipality" | "county", string>>;

/** The name people use for a place: the town (or village, city, suburb), not the street. */
export function townFromAddress(address: NominatimAddress | null | undefined): string | null {
  if (!address) return null;
  for (const key of ["town", "village", "city", "suburb", "hamlet", "municipality", "county"] as const) {
    const name = address[key]?.trim();
    if (name) return name;
  }
  return null;
}

/**
 * The town for a spot, from OpenStreetMap, for the weather button ("17°
 * Tauranga"). Only the rounded spot (two decimals, about 1 km) is ever sent,
 * and nothing about who is asking. Null when it can't be named.
 */
export async function townAt(lat: number, lng: number, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const params = new URLSearchParams({ lat: lat.toFixed(2), lon: lng.toFixed(2), format: "jsonv2", zoom: "12", addressdetails: "1" });
  try {
    const res = await fetchImpl(`${NOMINATIM_REVERSE}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { address?: NominatimAddress } | null;
    return townFromAddress(body?.address);
  } catch {
    return null;
  }
}
