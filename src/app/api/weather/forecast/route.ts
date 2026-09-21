import { consumeFixedWindow, tooManyRequestsResponse } from "@/lib/rate-limit";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchOpenMeteoWeather } from "@/lib/weather-impact/open-meteo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const quota = consumeFixedWindow(`weather:${user.id}`, 60, 15 * 60_000);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);
  const latText = request.nextUrl.searchParams.get("lat");
  const lngText = request.nextUrl.searchParams.get("lng");
  const latitude = Number(latText), longitude = Number(lngText);
  if (!latText?.trim() || !lngText?.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: "Send lat and lng." }, { status: 400 });
  }
  try {
    const data = await fetchOpenMeteoWeather({ latitude: Math.round(latitude * 100) / 100, longitude: Math.round(longitude * 100) / 100, signal: request.signal });
    return NextResponse.json(data, { headers: { "cache-control": "private, max-age=300" } });
  } catch {
    return NextResponse.json({ error: "The forecast service did not answer. Try again shortly." }, { status: 502 });
  }
}
