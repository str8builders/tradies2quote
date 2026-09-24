"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { captureError } from "@/lib/observability";
import { createClient } from "@/lib/supabase/server";
import { canChooseNewLook, newLookDefault, resolveNewLook } from "@/lib/ui/newLook";

export type SetNewLookResult =
  | { ok: true; on: boolean; choice: boolean | null }
  | { ok: false; error: string };

/**
 * Save the signed-in user's new-look choice (true, false, or null to follow
 * the default). Owner-only while T2Q_NEW_LOOK_DEFAULT is off — the same rule
 * that hides the switch in Settings, checked again here because a server
 * action is a public endpoint. Writes only the caller's own profile row; the
 * profiles_update_own policy enforces that in the database too.
 */
export async function setNewLookAction(choice: unknown): Promise<SetNewLookResult> {
  if (choice !== true && choice !== false && choice !== null) {
    return { ok: false, error: "That isn't a valid choice." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const envDefault = newLookDefault();
  if (!canChooseNewLook(user.email, envDefault)) {
    return { ok: false, error: "The new look isn't ready for your account yet." };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ ui_new_look: choice })
    .eq("id", user.id)
    .select("id");
  if (error) {
    console.error("[settings/new-look] save failed", error);
    captureError(error, { route: "settings/new-look" });
    return { ok: false, error: "Couldn't save that. Try again in a minute." };
  }
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: "Couldn't find your profile. Sign out and in again, then retry." };
  }

  revalidatePath("/app", "layout");
  return {
    ok: true,
    on: resolveNewLook({ profileValue: choice, envDefault, canChoose: true }),
    choice,
  };
}
