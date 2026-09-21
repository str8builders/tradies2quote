import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchOpenMeteoWeather } from "@/lib/weather-impact/open-meteo-server";
import { classifyOutlookDay, type DayOutlook } from "@/lib/weather-impact/outlook";
import { evaluateWeatherImpact } from "@/lib/weather-impact/evaluate";
import { TRADE_PROFILES } from "@/lib/weather-impact/config";
import type { WeatherImpactStatus, WeatherImpactTrade } from "@/lib/weather-impact/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface HereWeather {
  current: { summary: string | null; temperatureC: number | null; windGustKph: number | null; rainProbabilityPct: number | null };
  days: DayOutlook[];
  trades: Array<{ id: WeatherImpactTrade; label: string; status: WeatherImpactStatus; reason: string }>;
}

/** Forecast + a safe/caution/unsafe call for every trade, for one spot. Cached 30 min per ~1 km cell. */
const loadHere = unstable_cache(
  async (lat: number, lng: number): Promise<HereWeather> => {
    const input = await fetchOpenMeteoWeather({ latitude: lat, longitude: lng });
    const days = (input.daily ?? []).slice(0, 5).map(classifyOutlookDay);
    const trades = (Object.keys(TRADE_PROFILES) as WeatherImpactTrade[]).map((id) => {
      const result = evaluateWeatherImpact({ trade: id, weather: input });
      return { id, label: TRADE_PROFILES[id].label, status: result.overall_status, reason: result.reasons[0] ?? (result.overall_status === "safe" ? "No weather limits" : result.weather_summary) };
    });
    return {
      current: { summary: input.summary ?? null, temperatureC: input.temperatureC, windGustKph: input.windGustKph, rainProbabilityPct: input.rainProbabilityPct },
      days,
      trades,
    };
  },
  ["t2q-weather-here"],
  { revalidate: 1800 },
);

/**
 * Weather where the phone is. The browser sends its coordinates (only after
 * the tradie taps "Use my location"); nothing is stored. Rounded to two
 * decimals (~1 km) so the cache is shared and the exact position never
 * reaches the forecast provider.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const quota = consumeFixedWindow(`weather:${user.id}`, 60, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!request.nextUrl.searchParams.get("lat")?.trim() || !request.nextUrl.searchParams.get("lng")?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Send lat and lng." }, { status: 400 });
  }
  try {
    const data = await loadHere(Math.round(lat * 100) / 100, Math.round(lng * 100) / 100);
    return NextResponse.json(data, { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "The forecast service did not answer. Try again shortly." }, { status: 502 });
  }
}
