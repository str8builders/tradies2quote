import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isNewLookOn } from "@/lib/ui/newLook";
import { BusinessForm } from "../_newlook/BusinessForm";
import { LEGACY_SETTINGS_HREF, SETTINGS_PATHS } from "../_newlook/hub";
import { loadSettings } from "../_newlook/load";
import { LoadFailed } from "../_newlook/LoadFailed";
import { SettingsScreen } from "../_newlook/SettingsScreen";

export const metadata: Metadata = {
  title: "Business details",
};

export const dynamic = "force-dynamic";

/**
 * /app/settings/business (new look): name, logo, phone, email, address and
 * GST/tax number. Saves through the existing `saveSettings` action; the logo
 * through the existing logo actions. With the new look off it hands over to
 * the old settings page at the same spot.
 */
export default async function BusinessSettingsPage() {
  if (!(await isNewLookOn())) redirect(LEGACY_SETTINGS_HREF.business);
  const settings = await loadSettings();
  return (
    <SettingsScreen title="Business details" saveBar testId="settings-business">
      {settings.loadFailed ? (
        <LoadFailed retryHref={SETTINGS_PATHS.business} />
      ) : (
        <BusinessForm
          initial={settings.values}
          loadedTaxLabel={settings.taxLabel}
          logoUrl={settings.profile?.logo_url ?? null}
        />
      )}
    </SettingsScreen>
  );
}
