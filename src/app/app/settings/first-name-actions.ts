"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { captureError } from "@/lib/observability";
import { normalizeFirstName } from "@/lib/profile-name";
import { createClient } from "@/lib/supabase/server";

export type SetFirstNameResult = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Save the signed-in user's first name (blank clears it). Writes only the
 * caller's own profile row; the profiles_update_own policy enforces that in
 * the database too, and the column's check repeats the 40-character limit.
 */
export async function setFirstNameAction(raw: unknown): Promise<SetFirstNameResult> {
  const parsed = normalizeFirstName(raw);
  if (!parsed.ok) return parsed;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("profiles")
    .update({ first_name: parsed.value })
    .eq("id", user.id)
    .select("id");
  if (error) {
    console.error("[settings/first-name] save failed", error);
    captureError(error, { route: "settings/first-name" });
    return { ok: false, error: "Couldn't save your name. Try again in a minute." };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "Couldn't find your profile. Sign out and in again, then retry." };
  }

  revalidatePath("/app", "layout");
  return { ok: true, value: parsed.value };
}
