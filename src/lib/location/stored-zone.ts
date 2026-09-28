import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * profiles.time_zone: the business's own zone, saved from the phone or
 * browser (20260929_profiles_time_zone.sql). Read and written loosely:
 * before that migration the column isn't there, which reads as "no stored
 * zone" (the country's zone is used, as before) and makes a save a no-op.
 * The column isn't in database.types.ts yet, hence the narrow types here.
 */
interface ZoneRows {
  select(columns: "time_zone"): {
    eq(column: "id", value: string): {
      maybeSingle(): PromiseLike<{ data: { time_zone?: unknown } | null; error: { code?: string } | null }>;
    };
  };
  update(values: { time_zone: string }): {
    eq(column: "id", value: string): PromiseLike<{ error: { code?: string; message?: string } | null }>;
  };
}

function profiles(db: unknown): ZoneRows {
  return (db as { from(table: "profiles"): ZoneRows }).from("profiles");
}

/** The zone saved on a profile, or null (none yet, or the column isn't there yet). */
export async function readStoredTimeZone(db: unknown, userId: string): Promise<string | null> {
  try {
    const { data, error } = await profiles(db).select("time_zone").eq("id", userId).maybeSingle();
    if (error) return null;
    const zone = data?.time_zone;
    return typeof zone === "string" && zone.trim() ? zone.trim() : null;
  } catch {
    return null;
  }
}

/** The signed-in person's saved zone, once per request (the top bar and the page share it). */
export const getStoredTimeZone = cache(async (userId: string): Promise<string | null> => {
  try {
    return await readStoredTimeZone(await createClient(), userId);
  } catch {
    return null;
  }
});

/** Postgres/PostgREST codes for "no such column" (the migration isn't applied yet). */
const MISSING_COLUMN = new Set(["42703", "PGRST204"]);

/**
 * Save a zone on the caller's own profile (RLS: profiles_update_own).
 * "missing" when the column isn't there yet.
 */
export async function writeStoredTimeZone(
  db: unknown,
  userId: string,
  zone: string,
): Promise<"saved" | "missing" | { error: unknown }> {
  try {
    const { error } = await profiles(db).update({ time_zone: zone }).eq("id", userId);
    if (!error) return "saved";
    return error.code && MISSING_COLUMN.has(error.code) ? "missing" : { error };
  } catch (error) {
    return { error };
  }
}
