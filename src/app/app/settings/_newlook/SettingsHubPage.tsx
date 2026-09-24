import { redirect } from "next/navigation";
import { resolveTaxLabel } from "@/lib/quote-defaults";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { newLookSettingsRedirect, settingsHubItems } from "./hub";
import { SettingsHub } from "./SettingsHub";

/** The profile's tax name (GST, VAT or Tax) for the hub's wording; GST when unreadable. */
async function readTaxLabel(userId: string): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("country, currency, tax_label")
      .eq("id", userId)
      .maybeSingle();
    return resolveTaxLabel(data?.tax_label, data?.country, data?.currency);
  } catch {
    return resolveTaxLabel(null, null, null);
  }
}

/**
 * /app/settings with the new look on. Stripe's return (?stripe=return) goes
 * straight on to the Payments page, which refreshes the account status.
 */
export async function SettingsHubPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const target = newLookSettingsRedirect(await searchParams);
  if (target) redirect(target);
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const [taxLabel, native] = await Promise.all([readTaxLabel(user.id), isNativeShellRequest()]);
  return <SettingsHub items={settingsHubItems({ taxLabel, native })} />;
}
