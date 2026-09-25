import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { avatarLetter, greetingName } from "@/lib/profile-name";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { getCachedTopBarProfile } from "@/lib/supabase/profile";
import { OUTDOOR_COOKIE, isOutdoorCookieValue } from "@/lib/ui/outdoor";
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
  const [{ user }, cookieStore] = await Promise.all([getCachedAuthUser(), cookies()]);
  const profile = user
    ? await getCachedTopBarProfile(user.id)
    : { firstName: null, businessName: null, avatarUrl: null, country: null, currency: null };
  const name = greetingName(profile);
  const email = user?.email ?? null;
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
  };
});
