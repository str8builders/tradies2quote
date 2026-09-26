import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { loadHereWeather, roundCoord, type HereWeather } from "@/lib/weather-impact/here";
import { geocodeAddress } from "@/lib/weather-planning/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The forecast at the business address, with its town ("Tauranga"). */
export type BaseWeather = HereWeather & { locality: string | null };

/** Why there's no forecast: no address on the profile, or it isn't on the map. */
export type NoBaseWeather = { error: string; reason: "no-address" | "not-found" };

class AddressNotFound extends Error {
  name = "AddressNotFound";
}

/**
 * Where the business address is (the same place-name lookup as Home's
 * weather line), cached a day per address. A miss throws so it isn't kept:
 * the lookup swallows network errors, and a blip shouldn't stick for a day.
 */
const placeOf = unstable_cache(
  async (address: string) => {
    const geo = await geocodeAddress({ address, signal: AbortSignal.timeout(8000) });
    if (!geo) throw new AddressNotFound(address);
    return { lat: geo.latitude, lng: geo.longitude, locality: geo.matchedName.split(",")[0]?.trim() || null };
  },
  ["t2q-weather-base-place"],
  { revalidate: 86400 },
);

/**
 * Weather at the business address: what the top bar's weather shows when
 * the phone's location isn't allowed. The address is the signed-in
 * person's own profile address (as on Home); nothing from the page is used.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("address").eq("id", user.id).maybeSingle();
  const address = typeof profile?.address === "string" ? profile.address.trim() : "";
  if (!address) {
    return NextResponse.json({ error: "No business address yet.", reason: "no-address" } satisfies NoBaseWeather, { status: 404 });
  }

  try {
    const place = await placeOf(address);
    const weather = await loadHereWeather(roundCoord(place.lat), roundCoord(place.lng));
    return NextResponse.json({ ...weather, locality: place.locality } satisfies BaseWeather, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AddressNotFound") {
      return NextResponse.json(
        { error: "The business address couldn't be found on the map.", reason: "not-found" } satisfies NoBaseWeather,
        { status: 404 },
      );
    }
    console.error("[api/weather/base]", e);
    captureError(e, { route: "/api/weather/base" });
    return NextResponse.json({ error: "The forecast service did not answer. Try again shortly." }, { status: 502 });
  }
}
