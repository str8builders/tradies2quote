import "server-only";
import { adminClient } from "@/lib/supabase/admin";

/** Phone upload keys are only ever touched with the service role (no API grants). */
export async function saveDeviceKey(userId: string, hash: string): Promise<boolean> {
  const { error } = await adminClient().from("location_devices").insert({ user_id: userId, token_hash: hash });
  return !error;
}

export async function revokeDeviceKeys(userId: string): Promise<void> {
  await adminClient()
    .from("location_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("revoked_at", null);
}
