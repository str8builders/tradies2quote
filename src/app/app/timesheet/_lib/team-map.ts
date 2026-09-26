import "server-only";
import { isValidLatLng, placeLabel } from "@/lib/location/geo";
import { loadJobSites } from "@/lib/location/sites";
import { createClient } from "@/lib/supabase/server";
import { nameFromEmail } from "./people";

export interface TeamMember {
  userId: string;
  name: string;
  startedAt: string;
  /** Latest known spot while clocked in, or null (location off / no fix yet). */
  at: { lat: number; lng: number; time: string; place: string } | null;
}

/**
 * Who's clocked in right now for the owner's business, and where each was
 * last seen (their route, else their start pin). Only people with location
 * on have a spot; nobody is shown when they're not clocked in.
 */
export async function loadTeamMap(ownerId: string): Promise<TeamMember[]> {
  const db = await createClient();
  const { data: sessions } = await db
    .from("work_sessions")
    .select("id, user_id, started_at, start_lat, start_lng, start_place")
    .eq("owner_id", ownerId)
    .is("ended_at", null)
    .order("started_at", { ascending: true });
  if (!sessions || sessions.length === 0) return [];
  const ids = sessions.map((s) => s.id);
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const [pointsResult, rosterResult, sites] = await Promise.all([
    db
      .from("location_points")
      .select("session_id, recorded_at, latitude, longitude")
      .in("session_id", ids)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: false })
      .limit(2000),
    db.rpc("team_roster"),
    loadJobSites(db, ownerId, { geocode: false }),
  ]);
  const latest = new Map<string, { lat: number; lng: number; time: string }>();
  for (const p of pointsResult.data ?? []) {
    if (!latest.has(p.session_id)) latest.set(p.session_id, { lat: p.latitude, lng: p.longitude, time: p.recorded_at });
  }
  const members = ((rosterResult.data as { members?: Array<{ user_id: string; email: string | null }> } | null)?.members ?? []);
  return sessions.map((s) => {
    const spot =
      latest.get(s.id) ??
      (s.start_lat != null && s.start_lng != null ? { lat: s.start_lat, lng: s.start_lng, time: s.started_at } : null);
    return {
      userId: s.user_id,
      name: s.user_id === ownerId ? "You" : nameFromEmail(members.find((m) => m.user_id === s.user_id)?.email ?? null),
      startedAt: s.started_at,
      at: spot && isValidLatLng(spot) ? { ...spot, place: placeLabel(spot, sites).text } : null,
    };
  });
}
