import "server-only";
import { cache } from "react";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";

/**
 * The new-look switch (redesign phase 2 onwards reads it).
 *
 *   T2Q_NEW_LOOK_DEFAULT = off (default) | on    — what everyone gets
 *   profiles.ui_new_look = null | true | false   — an explicit choice
 *
 * An explicit profile value wins for anyone allowed to choose: the owner while
 * the default is off, everyone once it is on. While the default is off a
 * stored value from anyone else is ignored, so switching the default back to
 * off is a real kill switch (and a hand-crafted API write cannot open the
 * preview early).
 */

export const NEW_LOOK_ENV = "T2Q_NEW_LOOK_DEFAULT";

export type NewLookDefault = "on" | "off";

/** Anything other than "on" (any case, trimmed) is off. */
export function parseNewLookDefault(raw: string | null | undefined): NewLookDefault {
  return (raw ?? "").trim().toLowerCase() === "on" ? "on" : "off";
}

export function newLookDefault(
  env: Record<string, string | undefined> = process.env,
): NewLookDefault {
  return parseNewLookDefault(env[NEW_LOOK_ENV]);
}

/** Who sees the Settings switch and may save a choice. */
export function canChooseNewLook(
  email: string | null | undefined,
  envDefault: NewLookDefault,
): boolean {
  return envDefault === "on" || isOwnerEmail(email);
}

/** Pure resolver: an explicit choice wins (when allowed), otherwise the default. */
export function resolveNewLook({
  profileValue,
  envDefault,
  canChoose = true,
}: {
  profileValue: boolean | null | undefined;
  envDefault: NewLookDefault;
  canChoose?: boolean;
}): boolean {
  if (canChoose && typeof profileValue === "boolean") return profileValue;
  return envDefault === "on";
}

export interface NewLookState {
  /** Show the new look to this user on this request. */
  on: boolean;
  /** The stored choice (null = follow the default, or not readable). */
  choice: boolean | null;
  envDefault: NewLookDefault;
  canChoose: boolean;
}

/**
 * Stored choice for a user, or null. Never throws: before the
 * 20260925_profiles_ui_new_look.sql migration is applied the column does not
 * exist, and the select error simply means "follow the default".
 */
async function readStoredChoice(userId: string): Promise<boolean | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("ui_new_look")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    const value = (data as { ui_new_look?: unknown }).ui_new_look;
    return typeof value === "boolean" ? value : null;
  } catch {
    return null;
  }
}

/**
 * Server helper: the signed-in user's new-look state for this request.
 * Request-scoped (React cache) and shares the auth round trip with the page.
 * Users who cannot choose cost no database read.
 */
export const getNewLookState = cache(async (): Promise<NewLookState> => {
  const envDefault = newLookDefault();
  const { user } = await getCachedAuthUser();
  if (!user) {
    return { on: envDefault === "on", choice: null, envDefault, canChoose: false };
  }
  const canChoose = canChooseNewLook(user.email, envDefault);
  const choice = canChoose ? await readStoredChoice(user.id) : null;
  return {
    on: resolveNewLook({ profileValue: choice, envDefault, canChoose }),
    choice,
    envDefault,
    canChoose,
  };
});

/** Convenience for layouts and pages: should this request get the new look? */
export async function isNewLookOn(): Promise<boolean> {
  return (await getNewLookState()).on;
}
