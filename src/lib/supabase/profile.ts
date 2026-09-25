import "server-only";
import { cache } from "react";
import { createClient } from "./server";

/**
 * Request-scoped profile reads used by the app shell.
 *
 * The desktop header and mobile app menu both need the same avatar URL.
 * Caching keeps that to one profile query per server render, while still
 * tolerating installs where the optional `avatar_url` column has not landed.
 */
export const getCachedAvatarUrl = cache(async (userId: string) => {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", userId)
      .maybeSingle();

    if (
      !error &&
      data &&
      typeof (data as { avatar_url?: unknown }).avatar_url === "string"
    ) {
      return (data as { avatar_url: string }).avatar_url;
    }
  } catch {
    // Column not present yet — initials fallback is fine.
  }

  return null;
});

export interface TopBarProfile {
  firstName: string | null;
  businessName: string | null;
  avatarUrl: string | null;
  /** For the business's time zone (the greeting's morning/afternoon). */
  country: string | null;
  currency: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value : null);

/**
 * What the new-look top bar and account sheet show: your first name, the
 * business name, your photo, and where the business is (for the greeting). One query per render (React cache). Before
 * the first_name migration lands that column is missing and the select
 * fails, so it retries without it; any other failure gives an empty profile
 * (the bar then shows the greeting on its own and your initial).
 */
export const getCachedTopBarProfile = cache(async (userId: string): Promise<TopBarProfile> => {
  const empty: TopBarProfile = { firstName: null, businessName: null, avatarUrl: null, country: null, currency: null };
  const common = (row: Record<string, unknown>) => ({
    businessName: text(row.business_name),
    avatarUrl: text(row.avatar_url),
    country: text(row.country),
    currency: text(row.currency),
  });
  try {
    const supabase = await createClient();
    const full = await supabase
      .from("profiles")
      .select("first_name, business_name, avatar_url, country, currency")
      .eq("id", userId)
      .maybeSingle();
    if (!full.error) {
      const row = (full.data ?? {}) as Record<string, unknown>;
      return { firstName: text(row.first_name), ...common(row) };
    }
    const basic = await supabase
      .from("profiles")
      .select("business_name, avatar_url, country, currency")
      .eq("id", userId)
      .maybeSingle();
    if (basic.error) return empty;
    const row = (basic.data ?? {}) as Record<string, unknown>;
    return { firstName: null, ...common(row) };
  } catch {
    return empty;
  }
});
