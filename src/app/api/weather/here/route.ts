import { NextResponse, type NextRequest } from "next/server";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { loadHereWeather, roundCoord } from "@/lib/weather-impact/here";

export type { HereTrade, HereWeather } from "@/lib/weather-impact/here";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weather where the phone is: forecast + a safe/caution/unsafe call for
 * every trade (cached 30 min per ~1 km cell). The page sends its
 * coordinates only when location is already allowed or after the tradie
 * taps "Use my location"; nothing is stored. Rounded to two decimals
 * (~1 km) so the cache is shared and the exact position never reaches the
 * forecast provider.
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
    const data = await loadHereWeather(roundCoord(lat), roundCoord(lng));
    return NextResponse.json(data, { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("[api/weather/here]", e);
    captureError(e, { route: "/api/weather/here" });
    return NextResponse.json({ error: "The forecast service did not answer. Try again shortly." }, { status: 502 });
  }
}
