import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { followupsEnabled, reviewsEnabled } from "@/lib/engagement";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { LEGACY_SETTINGS_HREF, SETTINGS_PATHS } from "../_newlook/hub";
import { loadSettings } from "../_newlook/load";
import { LoadFailed } from "../_newlook/LoadFailed";
import { RatesForm, type EngagementSetup } from "../_newlook/RatesForm";
import { RequestLinkCard } from "../_newlook/RequestLinkCard";
import { SettingsScreen } from "../_newlook/SettingsScreen";

export const metadata: Metadata = {
  title: "Rates and quotes",
};

export const dynamic = "force-dynamic";

/** Follow-ups and reviews, read exactly as the old page reads them (flag-gated). */
async function loadEngagement(userId: string): Promise<EngagementSetup | null> {
  const reviews = reviewsEnabled();
  const followups = followupsEnabled();
  if (!reviews && !followups) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("feature_settings")
    .select("google_review_url, auto_review_enabled, auto_followup_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    show: { reviews, followups },
    initial: {
      googleReviewUrl: data?.google_review_url ?? "",
      autoReview: Boolean(data?.auto_review_enabled),
      autoFollowup: Boolean(data?.auto_followup_enabled),
    },
  };
}

/**
 * /app/settings/rates (new look): labour rate, markup, tax and currency,
 * quote terms, the client request link and its QR code, and follow-ups
 * when switched on. Every save uses an existing action.
 */
export default async function RatesSettingsPage() {
  if (!(await isNewLookOn())) redirect(LEGACY_SETTINGS_HREF.rates);
  const settings = await loadSettings();
  if (settings.loadFailed) {
    return (
      <SettingsScreen title="Rates and quotes" testId="settings-rates">
        <LoadFailed retryHref={SETTINGS_PATHS.rates} />
      </SettingsScreen>
    );
  }
  const profile = settings.profile;
  const engagement = await loadEngagement(settings.user.id);
  return (
    <SettingsScreen title="Rates and quotes" saveBar testId="settings-rates">
      <RatesForm
        initial={settings.values}
        loadedTaxLabel={settings.taxLabel}
        engagement={engagement}
        requestLink={
          <RequestLinkCard
            initialSlug={profile?.request_slug ?? null}
            appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com"}
            hasBusinessName={Boolean(profile?.business_name?.trim())}
            hasLogo={Boolean(profile?.logo_url && /^https:\/\//i.test(profile.logo_url))}
          />
        }
      />
    </SettingsScreen>
  );
}
