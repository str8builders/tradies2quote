import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getConnectStatus, paymentsEnabled, refreshConnectStatus } from "@/lib/payments";
import { isStripeConfigured } from "@/lib/stripe-client";
import { getCachedSubscriptionStatus } from "@/lib/subscription";
import { isNewLookOn } from "@/lib/ui/newLook";
import { LEGACY_SETTINGS_HREF, SETTINGS_PATHS } from "../_newlook/hub";
import { loadSettings } from "../_newlook/load";
import { LoadFailed } from "../_newlook/LoadFailed";
import { PaymentsForm, type CardPaymentsStatus } from "../_newlook/PaymentsForm";
import { PlanCard } from "../_newlook/PlanCard";
import { planSummary } from "../_newlook/plan";
import { SettingsScreen } from "../_newlook/SettingsScreen";

export const metadata: Metadata = {
  title: "Payments",
};

export const dynamic = "force-dynamic";

/**
 * /app/settings/payments (new look): how clients pay you, card payments and
 * deposits (flag-gated, as today), and your Tradies2Quote plan.
 *
 * The plan card is withheld on the SERVER inside the iOS app: prices and
 * billing links must never be in the App Store build's HTML (3.1.3(f)), the
 * same gate the old page uses, with <HideInNativeApp> as the backstop.
 */
export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const params = await searchParams;
  const stripeReturn = params?.stripe === "return";
  if (!(await isNewLookOn())) {
    redirect(stripeReturn ? "/app/settings?stripe=return" : LEGACY_SETTINGS_HREF.payments);
  }
  const settings = await loadSettings();
  if (settings.loadFailed) {
    return (
      <SettingsScreen title="Payments" testId="settings-payments">
        <LoadFailed retryHref={SETTINGS_PATHS.payments} />
      </SettingsScreen>
    );
  }
  const { user } = settings;

  // Back from Stripe's setup (?stripe=return): read the live account status
  // once; otherwise our stored copy. Skipped entirely while the flag is off.
  let cardPayments: CardPaymentsStatus | null = null;
  if (paymentsEnabled()) {
    const status = stripeReturn ? await refreshConnectStatus(user.id) : await getConnectStatus(user.id);
    cardPayments = {
      connected: status.connected,
      chargesEnabled: status.chargesEnabled,
      detailsSubmitted: status.detailsSubmitted,
      depositPct: status.depositPct,
    };
  }

  const native = await isNativeShellRequest();
  const plan = native ? null : (
    <HideInNativeApp>
      <PlanCard
        summary={planSummary(
          await getCachedSubscriptionStatus(user.id, user.created_at ?? null, user.email),
          isStripeConfigured(),
        )}
      />
    </HideInNativeApp>
  );

  return (
    <SettingsScreen title="Payments" saveBar testId="settings-payments">
      <PaymentsForm initial={settings.values} cardPayments={cardPayments} plan={plan} />
    </SettingsScreen>
  );
}
