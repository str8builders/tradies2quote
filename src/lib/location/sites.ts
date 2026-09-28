import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { JobSite } from "./geo";
import { lookUpStreet } from "./street-geocode";

type Db = SupabaseClient<Database>;

/** New addresses looked up per call, one a second (Nominatim's limit). */
export const GEOCODE_PER_CALL = 3;
/** iOS watches up to 20 areas per app; keep a few spare. */
export const MAX_GEOFENCES = 18;

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * How long an address that couldn't be placed waits before it's looked up
 * again (unless it's changed): a week when nothing matched, a day when the
 * service had trouble. Nominatim asks for no repeated lookups.
 */
export const MISS_RETRY_MS = { not_found: 7 * DAY_MS, error: DAY_MS } as const;

/** A remembered failed lookup (public.job_site_misses, 20260929_location_fixes.sql). */
export interface SiteMiss {
  client_id: string;
  address: string;
  reason: "not_found" | "error";
  failed_at: string;
}

/**
 * job_site_misses isn't in database.types.ts yet: narrow loose types. Before
 * the migration the table is missing, which reads as "no misses" (every
 * load tries again, as before) and saving one does nothing.
 */
interface MissRows {
  select(columns: string): { eq(column: "owner_id", value: string): PromiseLike<{ data: SiteMiss[] | null; error: unknown }> };
  upsert(row: SiteMiss & { owner_id: string }, options: { onConflict: "client_id" }): PromiseLike<{ error: unknown }>;
  delete(): { eq(column: "client_id", value: string): PromiseLike<{ error: unknown }> };
}

function misses(db: Db): MissRows {
  return (db as unknown as { from(table: "job_site_misses"): MissRows }).from("job_site_misses");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A client's address to look up now: long enough to be a street address,
 * with no saved point (or a found one for an address that has since
 * changed; pinned ones stay), and not a recent failure for the same address.
 */
export function needsLookup(
  client: { address: string | null },
  site: { source: string; address: string | null } | undefined,
  miss: Pick<SiteMiss, "address" | "reason" | "failed_at"> | undefined,
  now: number,
): boolean {
  const address = client.address ?? "";
  if (address.trim().length <= 5) return false;
  if (site && !(site.source === "geocoded" && (site.address ?? "") !== address)) return false;
  if (miss && miss.address === address) {
    const since = now - Date.parse(miss.failed_at);
    const wait = MISS_RETRY_MS[miss.reason] ?? MISS_RETRY_MS.not_found;
    if (Number.isFinite(since) && since < wait) return false;
  }
  return true;
}

/**
 * The business's job sites: every client with a pinned or found point.
 * Clients with an address but no point yet are looked up (a few per call,
 * kept in job_sites, so each address is only looked up once; one that
 * can't be placed is remembered and left for a while).
 */
export async function loadJobSites(
  db: Db,
  ownerId: string,
  { country, geocode = true }: { country?: string | null; geocode?: boolean } = {},
): Promise<JobSite[]> {
  const [clientsResult, sitesResult, missesResult] = await Promise.all([
    db.from("clients").select("id, name, address").eq("user_id", ownerId).limit(500),
    db.from("job_sites").select("client_id, address, latitude, longitude, radius_m, source").eq("owner_id", ownerId),
    geocode
      ? Promise.resolve(misses(db).select("client_id, address, reason, failed_at").eq("owner_id", ownerId)).catch(() => ({ data: null }))
      : Promise.resolve({ data: null }),
  ]);
  const clients = clientsResult.data ?? [];
  const sites = new Map((sitesResult.data ?? []).map((s) => [s.client_id, s]));

  if (geocode) {
    const missed = new Map((missesResult.data ?? []).map((m) => [m.client_id, m]));
    const now = Date.now();
    const missing = clients
      .filter((c) => needsLookup(c, sites.get(c.id), missed.get(c.id), now))
      .slice(0, GEOCODE_PER_CALL);
    for (const [i, client] of missing.entries()) {
      if (i > 0) await pause(1100);
      const address = client.address!;
      const found = await lookUpStreet(address, { country });
      if ("miss" in found) {
        await Promise.resolve(
          misses(db).upsert(
            { client_id: client.id, owner_id: ownerId, address, reason: found.miss, failed_at: new Date().toISOString() },
            { onConflict: "client_id" },
          ),
        ).catch(() => undefined);
        // The service is struggling: leave the rest for another time.
        if (found.miss === "error") break;
        continue;
      }
      const row = {
        client_id: client.id,
        owner_id: ownerId,
        address,
        latitude: found.point.lat,
        longitude: found.point.lng,
        source: "geocoded",
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from("job_sites").upsert(row, { onConflict: "client_id" });
      if (!error) sites.set(client.id, { ...row, radius_m: 150 });
      if (missed.has(client.id)) await Promise.resolve(misses(db).delete().eq("client_id", client.id)).catch(() => undefined);
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
