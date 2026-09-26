import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { townAt } from "@/lib/location/reverse-geocode";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { loadHereWeather, roundCoord } from "@/lib/weather-impact/here";

export type { HereTrade, HereWeather } from "@/lib/weather-impact/here";

/** The town for a rounded spot, cached a week (towns don't move). A miss throws, so it isn't kept. */
const townOf = unstable_cache(
  async (lat: number, lng: number) => {
    const town = await townAt(lat, lng);
    if (!town) throw new Error("No town for that spot");
    return town;
  },
  ["t2q-weather-town"],
  { revalidate: 604_800 },
);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weather where the phone is: forecast + a safe/caution/unsafe call for
 * every trade (cached 30 min per ~1 km cell). The page sends its
 * coordinates only when location is already allowed or after the tradie
 * taps "Use my location"; nothing is stored. Rounded to two decimals
 * (~1 km) so the cache is shared and the exact position never reaches the
 * forecast provider, or OpenStreetMap, which names the town for the button.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Send lat and lng." }, { status: 400 });
  }
  try {
    const spot = { lat: roundCoord(lat), lng: roundCoord(lng) };
    // The town is a nicety: without it the forecast still shows.
    const [data, locality] = await Promise.all([loadHereWeather(spot.lat, spot.lng), townOf(spot.lat, spot.lng).catch(() => null)]);
    return NextResponse.json({ ...data, locality }, { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("[api/weather/here]", e);
    captureError(e, { route: "/api/weather/here" });
    return NextResponse.json({ error: "The forecast service did not answer. Try again shortly." }, { status: 502 });
  }
}
