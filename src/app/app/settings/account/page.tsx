import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { getCachedAvatarUrl, getCachedTopBarProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/server";
import { getNewLookState } from "@/lib/ui/newLook";
import { OUTDOOR_COOKIE, isOutdoorCookieValue } from "@/lib/ui/outdoor";
import { NewLookSetting } from "../_components/NewLookSetting";
import { AiConsentCard } from "../_newlook/AiConsentCard";
import { AvatarField } from "../_newlook/AvatarField";
import { DeleteAccountCard } from "../_newlook/DeleteAccountCard";
import { FirstNameField } from "../_newlook/FirstNameField";
import { LEGACY_SETTINGS_HREF } from "../_newlook/hub";
import { NotificationsSetting } from "../_newlook/NotificationsSetting";
import { OutdoorSetting } from "../_newlook/OutdoorSetting";
import { SettingsScreen } from "../_newlook/SettingsScreen";

export const metadata: Metadata = {
  title: "Your account",
};

export const dynamic = "force-dynamic";

/** Consent timestamp for the iOS-only AI card; null when unreadable. */
async function readAiConsent(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("ai_consent_at").eq("id", userId).maybeSingle();
    return typeof data?.ai_consent_at === "string" ? data.ai_consent_at : null;
  } catch {
    return null;
  }
}

/**
 * /app/settings/account (new look): your photo, quote notifications, outdoor
 * mode, the owner-only new-look preview, AI consent (iOS app only, as
 * today), sign out and delete account. Everything here acts at once, so the
 * page has no Save button.
 *
 * "You" is your photo, your first name (for Home's greeting) and the email
 * you sign in with.
 */
export default async function AccountSettingsPage() {
  const newLook = await getNewLookState();
  if (!newLook.on) redirect(LEGACY_SETTINGS_HREF.account);
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");

  const [avatarUrl, profile, native, cookieStore] = await Promise.all([
    getCachedAvatarUrl(user.id),
    getCachedTopBarProfile(user.id),
    isNativeShellRequest(),
    cookies(),
  ]);
  const outdoorOn = isOutdoorCookieValue(cookieStore.get(OUTDOOR_COOKIE)?.value);
  const aiConsentedAt = native ? await readAiConsent(user.id) : null;

  return (
    <SettingsScreen title="Your account" testId="settings-account">
      <Card as="section" padding="lg" className="space-y-4" aria-labelledby="you-title">
        <SectionTitle id="you-title">You</SectionTitle>
        <AvatarField avatarUrl={avatarUrl} email={user.email ?? null} />
        <FirstNameField initial={profile.firstName} />
      </Card>

      <Card as="section" padding="lg" className="space-y-2" aria-labelledby="notify-title">
        <SectionTitle id="notify-title">Notifications</SectionTitle>
        <NotificationsSetting />
      </Card>

      <Card as="section" padding="lg" className="space-y-2" aria-labelledby="look-title">
        <SectionTitle id="look-title">How the app looks</SectionTitle>
        <OutdoorSetting initialOn={outdoorOn} />
      </Card>

      {newLook.canChoose ? (
        <NewLookSetting initialChoice={newLook.choice} envDefault={newLook.envDefault} />
      ) : null}

      {native ? <AiConsentCard consentedAt={aiConsentedAt} /> : null}

      <Card as="section" padding="lg" className="space-y-4" aria-labelledby="sign-out-title">
        <SectionTitle id="sign-out-title" description="You can sign back in any time with your email and password.">
          Sign out
        </SectionTitle>
        {/* POSTs to the sign-out route so the cookies are cleared on the
            redirect response, as the old page does. */}
        <form action="/auth/signout" method="POST">
          <Button
            type="submit"
            variant="secondary"
            fullWidth
            icon={<SignOut weight="bold" />}
            data-testid="settings-sign-out"
          >
            Sign out
          </Button>
        </form>
      </Card>

      <DeleteAccountCard />
    </SettingsScreen>
  );
}
