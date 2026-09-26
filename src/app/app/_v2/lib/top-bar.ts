import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { shouldOfferT2QCAL } from "@/lib/calculator-app";
import { isNativeShellRequest } from "@/lib/native-shell";
import { isOwnerEmail } from "@/lib/owner";
import { avatarLetter, greetingName } from "@/lib/profile-name";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { getCachedTopBarProfile } from "@/lib/supabase/profile";
import { getNewLookState } from "@/lib/ui/newLook";
import { OUTDOOR_COOKIE, isOutdoorCookieValue } from "@/lib/ui/outdoor";
import { isWeatherImpactEnabled } from "@/lib/weather-impact/feature-flag";
import { businessTimeZone, greetingFor, type Greeting } from "./dates";

/** Everything the top bar, its account sheet and the welcome show. */
export interface TopBarData {
  /** "Good morning" in the business's time zone. */
  greeting: Greeting;
  /** "Saturday 26 September", in the business's time zone (the welcome). */
  today: string;
  /** Your first name, else the business name, else null. */
  name: string | null;
  /** The avatar's letter when there's no photo. */
  letter: string;
  avatarUrl: string | null;
  email: string | null;
  businessName: string | null;
  /** The t2q-outdoor cookie, so the sheet's switch paints right first time. */
  outdoor: boolean;
  /** Show the "Open T2QCAL" buttons (see shouldOfferT2QCAL). */
  t2qcal: boolean;
  /** The owner's tools go in the photo menu. */
  isOwner: boolean;
  /** The new-look preview switch goes in the photo menu. */
  canChooseLook: boolean;
  /**
   * Show the weather, top right (weather impact isn't parked for this
   * account). The forecast itself loads in the browser: the phone's
   * location when already allowed, else /api/weather/base (the business
   * address), so no page waits on it.
   */
  weather?: boolean;
}

/** "Saturday 26 September" in a time zone; plain English whatever the device. */
export function longDay(now: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long", timeZone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-NZ", { weekday: "long", day: "numeric", month: "long" }).format(now);
  }
}

/** The request's clock, outside any component body (react-hooks/purity). */
function requestTime(): Date {
  return new Date();
}

/**
 * The signed-in user's top bar, once per request (React cache; the profile
 * and auth reads are cached too). Never throws: a missing profile gives the
 * greeting on its own and the email's initial.
 */
export const loadTopBarData = cache(async (): Promise<TopBarData> => {
  const [{ user }, cookieStore, nativeShell, look] = await Promise.all([
    getCachedAuthUser(),
    cookies(),
    isNativeShellRequest(),
    getNewLookState(),
  ]);
  const profile = user
    ? await getCachedTopBarProfile(user.id)
    : { firstName: null, businessName: null, avatarUrl: null, country: null, currency: null };
  const name = greetingName(profile);
  const email = user?.email ?? null;
  const isOwner = isOwnerEmail(email);
  const now = requestTime();
  const timeZone = businessTimeZone(profile.country, profile.currency);
  return {
    greeting: greetingFor(now, timeZone),
    today: longDay(now, timeZone),
    name,
    letter: avatarLetter(profile.firstName ?? profile.businessName, email),
    avatarUrl: profile.avatarUrl,
    email,
    businessName: profile.businessName,
    outdoor: isOutdoorCookieValue(cookieStore.get(OUTDOOR_COOKIE)?.value),
    t2qcal: shouldOfferT2QCAL({ nativeShell, appStoreUrl: process.env.NEXT_PUBLIC_T2QCAL_APPSTORE_URL, isOwner }),
    isOwner,
    canChooseLook: look.canChoose,
    weather: isWeatherImpactEnabled(isOwner),
  };
});
