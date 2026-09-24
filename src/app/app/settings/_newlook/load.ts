import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { loadedTaxLabel, toSettingsValues, type SettingsProfileRow, type SettingsValues } from "./model";

/** The old settings page's profile select, so every page reads the same row. */
export const SETTINGS_PROFILE_COLUMNS =
  "business_name, email, phone, address, gst_number, payment_instructions, country, currency, tax_label, tax_rate, default_labour_rate, default_markup_pct, logo_url, ai_consent_at, request_slug";

export interface SettingsProfile extends SettingsProfileRow {
  logo_url?: string | null;
  ai_consent_at?: string | null;
  request_slug?: string | null;
}

export interface LoadedSettings {
  user: User;
  profile: SettingsProfile | null;
  values: SettingsValues;
  /** GST, VAT or Tax, resolved the way the old page does on load. */
  taxLabel: string;
  /**
   * The profile could not be read. The pages then show a retry instead of
   * the form: every Save sends all fields, so saving over a failed read
   * would replace the real details with blanks and defaults.
   */
  loadFailed: boolean;
}

/** Signed-in user plus their settings row, for the new-look settings pages. */
export async function loadSettings(): Promise<LoadedSettings> {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const supabase = await createClient();
  let profile: SettingsProfile | null = null;
  let loadFailed = false;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(SETTINGS_PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle();
    if (error) loadFailed = true;
    else profile = (data as SettingsProfile | null) ?? null;
  } catch {
    loadFailed = true;
  }
  return {
    user,
    profile,
    values: toSettingsValues(profile, user.email),
    taxLabel: loadedTaxLabel(profile),
    loadFailed,
  };
}
