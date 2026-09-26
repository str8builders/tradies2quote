import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { JobSite } from "./geo";
import { geocodeStreet } from "./street-geocode";

type Db = SupabaseClient<Database>;

/** New addresses looked up per call, one a second (Nominatim's limit). */
export const GEOCODE_PER_CALL = 3;
/** iOS watches up to 20 areas per app; keep a few spare. */
export const MAX_GEOFENCES = 18;

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The business's job sites: every client with a pinned or found point.
 * Clients with an address but no point yet are looked up (a few per call,
 * kept in job_sites, so each address is only ever looked up once).
 */
export async function loadJobSites(
  db: Db,
  ownerId: string,
  { country, geocode = true }: { country?: string | null; geocode?: boolean } = {},
): Promise<JobSite[]> {
  const [clientsResult, sitesResult] = await Promise.all([
    db.from("clients").select("id, name, address").eq("user_id", ownerId).limit(500),
    db.from("job_sites").select("client_id, address, latitude, longitude, radius_m, source").eq("owner_id", ownerId),
  ]);
  const clients = clientsResult.data ?? [];
  const sites = new Map((sitesResult.data ?? []).map((s) => [s.client_id, s]));

  if (geocode) {
    // A saved point for an address that has since changed is looked up again (pinned ones stay).
    const missing = clients
      .filter((c) => (c.address ?? "").trim().length > 5)
      .filter((c) => {
        const site = sites.get(c.id);
        return !site || (site.source === "geocoded" && (site.address ?? "") !== (c.address ?? ""));
      })
      .slice(0, GEOCODE_PER_CALL);
    for (const [i, client] of missing.entries()) {
      if (i > 0) await pause(1100);
      const point = await geocodeStreet(client.address!, { country });
      if (!point) continue;
      const row = {
        client_id: client.id,
        owner_id: ownerId,
        address: client.address,
        latitude: point.lat,
        longitude: point.lng,
        source: "geocoded",
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("job_sites").upsert(row, { onConflict: "client_id" });
      if (!error) sites.set(client.id, { ...row, radius_m: 150 });
    }
  }

  const name = new Map(clients.map((c) => [c.id, (c.name ?? "").trim() || "client"]));
  return [...sites.values()]
    .filter((s) => name.has(s.client_id))
    .map((s) => ({
      clientId: s.client_id,
      name: name.get(s.client_id)!,
      address: s.address,
      lat: s.latitude,
      lng: s.longitude,
      radiusM: s.radius_m,
    }));
}

/**
 * The sites the phone watches for automatic clock-in (iOS allows 20): jobs
 * that are on (accepted, booked or under way), then the most recent quotes,
 * then pinned sites.
 */
export async function geofenceSites(db: Db, ownerId: string, sites: readonly JobSite[]): Promise<JobSite[]> {
  if (sites.length <= MAX_GEOFENCES) return sites.slice();
  const { data } = await db
    .from("quotes")
    .select("client_id, status, created_at")
    .eq("user_id", ownerId)
    .is("deleted_at", null)
    .not("client_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  const rank = new Map<string, number>();
  for (const q of data ?? []) {
    const active = ["accepted", "scheduled", "in_progress"].includes(q.status);
    const score = active ? 0 : 1;
    const id = q.client_id as string;
    if (!rank.has(id) || score < rank.get(id)!) rank.set(id, score);
  }
  return sites
    .slice()
    .sort((a, b) => (rank.get(a.clientId) ?? 2) - (rank.get(b.clientId) ?? 2))
    .slice(0, MAX_GEOFENCES);
}
