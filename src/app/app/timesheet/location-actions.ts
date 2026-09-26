"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { placeLabel, isValidLatLng } from "@/lib/location/geo";
import { createDeviceToken } from "@/lib/location/device-token";
import type { Fix } from "@/lib/location/fix";
import { geofenceSites, loadJobSites } from "@/lib/location/sites";
import { captureError } from "@/lib/observability";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { parseTime } from "@/lib/timesheet/hours";
import { businessTimeZone } from "../_v2/lib/dates";
import { businessOwnerFor } from "./_lib/load";
import { DEFAULT_CONSENT, type LocationState } from "./_lib/location-types";

export type LocationResult<T = undefined> = ({ ok: true } & (T extends undefined ? object : { value: T })) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = "/app/timesheet";

async function signedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function placeFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerId: string,
  fix: Fix | null | undefined,
): Promise<{ place: string | null; clientId: string | null }> {
  if (!fix || !isValidLatLng(fix)) return { place: null, clientId: null };
  const sites = await loadJobSites(supabase, ownerId, { geocode: false });
  const label = placeLabel(fix, sites);
  return { place: label.text, clientId: label.site?.clientId ?? null };
}

async function zoneFor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("country, currency").eq("id", userId).maybeSingle();
  return businessTimeZone(data?.country ?? null, data?.currency ?? null);
}

/**
 * Your location setting, whether you're clocked in, and the business's job
 * sites. `lookUp` finds a few new client addresses too (the Timesheet page);
 * the background helper on every page skips that.
 */
export async function getLocationState({ lookUp = false }: { lookUp?: boolean } = {}): Promise<LocationState> {
  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);
  const [consentResult, openResult, profileResult] = await Promise.all([
    supabase.from("location_consents").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("work_sessions").select("id, started_at, start_place, client_id, source").eq("user_id", user.id).is("ended_at", null).maybeSingle(),
    supabase.from("profiles").select("country, currency").eq("id", user.id).maybeSingle(),
  ]);
  const sites = await loadJobSites(supabase, ownerId, { country: profileResult.data?.country ?? null, geocode: lookUp });
  const c = consentResult.data;
  const open = openResult.data;
  return {
    consent: c
      ? {
          granted: c.granted,
          autoClock: c.auto_clock,
          workStart: String(c.work_start).slice(0, 5),
          workEnd: String(c.work_end).slice(0, 5),
          workDays: (c.work_days ?? []).map(Number),
        }
      : DEFAULT_CONSENT,
    open: open
      ? {
          id: open.id,
          startedAt: open.started_at,
          place: open.start_place,
          clientId: open.client_id,
          clientName: sites.find((s) => s.clientId === open.client_id)?.name ?? null,
          source: open.source === "auto" ? "auto" : "tap",
        }
      : null,
    sites,
    geofences: await geofenceSites(supabase, ownerId, sites),
    timeZone: businessTimeZone(profileResult.data?.country ?? null, profileResult.data?.currency ?? null),
  };
}

export interface ConsentInput {
  granted: boolean;
  autoClock: boolean;
  workStart: string;
  workEnd: string;
  workDays: number[];
}

/** Turn location on or off, and set automatic clock-in and its hours. Off also retires this person's phone upload keys. */
export async function saveLocationConsent(input: ConsentInput): Promise<LocationResult> {
  const start = parseTime(input?.workStart);
  const end = parseTime(input?.workEnd);
  if (start === null || end === null || end <= start) return { ok: false, error: "Work hours need a start before the finish." };
  const days = [...new Set((input.workDays ?? []).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (input.autoClock && days.length === 0) return { ok: false, error: "Pick at least one work day." };

  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);
  const granted = Boolean(input.granted);
  const now = new Date().toISOString();
  const { data: existing } = await supabase.from("location_consents").select("granted").eq("user_id", user.id).maybeSingle();
  const row = {
    user_id: user.id,
    owner_id: ownerId,
    granted,
    auto_clock: granted && Boolean(input.autoClock),
    work_start: input.workStart,
    work_end: input.workEnd,
    work_days: days,
    updated_at: now,
    ...(granted && !existing?.granted ? { granted_at: now, revoked_at: null } : {}),
    ...(!granted && existing?.granted ? { revoked_at: now } : {}),
  };
  const { error } = existing
    ? await supabase.from("location_consents").update(row).eq("user_id", user.id)
    : await supabase.from("location_consents").insert(row);
  if (error) {
    captureError(error, { route: "timesheet/location-consent" });
    return { ok: false, error: "Couldn't save that. Try again." };
  }
  if (!granted) {
    // Keys are only readable by the server; revoke through the API route's admin client.
    const { revokeDeviceKeys } = await import("./_lib/device-keys");
    await revokeDeviceKeys(user.id);
  }
  revalidatePath(PATH);
  return { ok: true };
}

/**
 * A new upload key for this phone (the iPhone app keeps it in its keychain
 * and sends the route with it while in the background). Location must be on.
 */
export async function issueDeviceKey(): Promise<LocationResult<string>> {
  const { supabase, user } = await signedIn();
  const { data } = await supabase.from("location_consents").select("granted").eq("user_id", user.id).maybeSingle();
  if (!data?.granted) return { ok: false, error: "Turn location on first." };
  const { token, hash } = createDeviceToken();
  const { saveDeviceKey } = await import("./_lib/device-keys");
  if (!(await saveDeviceKey(user.id, hash))) return { ok: false, error: "Couldn't set up this phone. Try again." };
  return { ok: true, value: token };
}


function cleanAt(at: unknown): string | null {
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  return new Date(at).toISOString();
}

/** Start work (a tap, or the phone arriving at a job site: `at` is the true arrival time). */
export async function clockIn(input: {
  fix?: Fix | null;
  at?: number | null;
  source?: "tap" | "auto";
  clientId?: string | null;
}): Promise<LocationResult<{ place: string | null }>> {
  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);
  const where = await placeFor(supabase, ownerId, input?.fix);
  const clientId = input?.clientId && UUID.test(input.clientId) ? input.clientId : where.clientId;
  const { error } = await supabase.rpc("clock_in", {
    p_at: cleanAt(input?.at),
    p_lat: input?.fix?.lat ?? null,
    p_lng: input?.fix?.lng ?? null,
    p_accuracy: input?.fix?.acc ?? null,
    p_place: where.place,
    p_client_id: clientId,
    p_source: input?.source === "auto" ? "auto" : "tap",
  });
  if (error) {
    if (/Already clocked in/.test(error.message)) return { ok: false, error: "You're already clocked in." };
    if (/out of range/.test(error.message)) return { ok: false, error: "That start time is too long ago." };
    captureError(error, { route: "timesheet/clock-in" });
    return { ok: false, error: "Couldn't start work. Check your signal and try again." };
  }
  revalidatePath(PATH);
  return { ok: true, value: { place: where.place } };
}

/** Finish work: the hours land on the timesheet (start, finish, break). */
export async function clockOut(input: {
  fix?: Fix | null;
  at?: number | null;
  breakMinutes?: number;
  clientId?: string | null;
}): Promise<LocationResult<{ place: string | null }>> {
  const breakMinutes = Number(input?.breakMinutes ?? 0);
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 600) return { ok: false, error: "Pick a break." };
  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);
  const where = await placeFor(supabase, ownerId, input?.fix);
  const { error } = await supabase.rpc("clock_out", {
    p_at: cleanAt(input?.at),
    p_lat: input?.fix?.lat ?? null,
    p_lng: input?.fix?.lng ?? null,
    p_accuracy: input?.fix?.acc ?? null,
    p_place: where.place,
    p_client_id: input?.clientId && UUID.test(input.clientId) ? input.clientId : null,
    p_break_minutes: breakMinutes,
    p_time_zone: await zoneFor(supabase, user.id),
  });
  if (error) {
    if (/Not clocked in/.test(error.message)) return { ok: false, error: "You're not clocked in." };
    if (/midnight/.test(error.message)) return { ok: false, error: "You started on an earlier day: pick the time you finished that day." };
    if (/out of range/.test(error.message)) return { ok: false, error: "That finish time is in the future." };
    if (/break is longer/.test(error.message)) return { ok: false, error: "The break is longer than the time worked." };
    if (/after start/.test(error.message)) return { ok: false, error: "That's less than a minute of work." };
    captureError(error, { route: "timesheet/clock-out" });
    return { ok: false, error: "Couldn't finish work. Check your signal and try again." };
  }
  revalidatePath(PATH);
  return { ok: true, value: { place: where.place } };
}

/** Save where you're standing as a client's job site (when the address can't be found, or is wrong). */
export async function pinJobSite(input: { clientId: string; fix: Fix }): Promise<LocationResult> {
  if (!UUID.test(String(input?.clientId)) || !isValidLatLng(input?.fix)) return { ok: false, error: "Pick a client and let your phone find you." };
  if ((input.fix.acc ?? 0) > 100) return { ok: false, error: "Your phone's location is too rough right now. Step outside and try again." };
  const { supabase, user } = await signedIn();
  const ownerId = await businessOwnerFor(user.id);
  const { error } = await supabase.from("job_sites").upsert(
    {
      client_id: input.clientId,
      owner_id: ownerId,
      latitude: input.fix.lat,
      longitude: input.fix.lng,
      source: "pinned",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );
  if (error) {
    captureError(error, { route: "timesheet/pin-site" });
    return { ok: false, error: "Couldn't save the site. Try again." };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** The route while clocked in, from the web page (the iPhone app sends it itself). */
export async function sendRoutePoints(points: Array<{ t: number; lat: number; lng: number; acc?: number | null }>): Promise<LocationResult> {
  if (!Array.isArray(points) || points.length === 0) return { ok: true };
  const { supabase } = await signedIn();
  const clean = points.slice(0, 500).filter((p) => isValidLatLng(p) && Number.isFinite(p.t));
  const { error } = await supabase.rpc("add_location_points", { p_user: null, p_points: clean as unknown as Json });
  if (error) {
    captureError(error, { route: "timesheet/route-points" });
    return { ok: false, error: "Couldn't send the route." };
  }
  return { ok: true };
}
