import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, SignOut } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { NZ_DEFAULTS } from "@/lib/quote-defaults";
import {
  runAdminAgent,
  summarizeAdmin,
  type AdminClientSnapshot,
  type AdminProfileSnapshot,
} from "@/lib/agents/admin";
import { logAgentEvent } from "@/lib/agent-monitor/logger";
import { isStripeConfigured } from "@/lib/stripe-client";
import { getSubscriptionStatus } from "@/lib/subscription";
import { AppHeader } from "../_components/AppHeader";
import { AdminChecklistPanel } from "../_components/agents/AdminChecklistPanel";
import { SettingsForm, type SettingsInitial } from "./_components/SettingsForm";
import { BusinessLogoField } from "./_components/BusinessLogoField";
import { AiConsentSetting } from "./_components/AiConsentSetting";
import { SubscriptionPanel } from "./_components/SubscriptionPanel";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { reviewsEnabled, followupsEnabled } from "@/lib/engagement";
import { EngagementSettings } from "./_components/EngagementSettings";
import { paymentsEnabled, getConnectStatus, refreshConnectStatus } from "@/lib/payments";
import { PaymentsSettings } from "./_components/PaymentsSettings";
import { QuoteRequestLinkCard } from "./_components/QuoteRequestLinkCard";
import { ReplayTourButton } from "./_components/ReplayTourButton";
import { DeleteAccountSection } from "./_components/DeleteAccountSection";

export const metadata: Metadata = {
  title: "Settings",
};

export const dynamic = "force-dynamic";

/**
 * /app/settings — editable profile settings.
 *
 * Wave 10 — the read-only `<Row>` view is gone; the page now loads the
 * profile row, hydrates the client `<SettingsForm />`, and lets the user
 * save via the `saveSettings` server action.
 *
 * Defense-in-depth:
 *   - `auth.getUser()` on the server, `redirect("/login")` if unset.
 *   - The form upserts using `user.id` as the row PK; the existing
 *     `profiles_*_own` RLS policies make any other id impossible.
 *
 * No write happens on this page — writes go through the server action in
 * `actions.ts`.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  // Wave 18.1 — perf — `getCachedAuthUser` shares one auth roundtrip
  // with the surrounding `<AppHeader>` + `<MobileAppMenu>`.
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  // Wave 14 — fetch profile + a slim clients snapshot so the inline
  // AdminChecklistPanel can flag setup gaps (business name, labour
  // rate, GST, clients without contact). Same RLS pattern the
  // settings form already uses — auth.uid() owns the rows.
  const [{ data: profile }, { data: clientsRows }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "business_name, email, phone, address, gst_number, payment_instructions, country, currency, tax_label, tax_rate, default_labour_rate, default_markup_pct, logo_url, ai_consent_at, request_slug",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("clients")
      .select("id, email, phone")
      .eq("user_id", user.id),
  ]);

  const adminProfile: AdminProfileSnapshot | null = profile
    ? {
        business_name: profile.business_name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        gst_number: profile.gst_number,
        country: profile.country,
        currency: profile.currency,
        tax_rate:
          typeof profile.tax_rate === "number" ? profile.tax_rate : null,
        default_labour_rate:
          typeof profile.default_labour_rate === "number"
            ? profile.default_labour_rate
            : null,
        default_markup_pct:
          typeof profile.default_markup_pct === "number"
            ? profile.default_markup_pct
            : null,
      }
    : null;

  const adminClients: AdminClientSnapshot = {
    count: clientsRows?.length ?? 0,
    countWithoutContact: (clientsRows ?? []).filter(
      (c) =>
        !(typeof c.email === "string" && c.email.trim().length > 0) &&
        !(typeof c.phone === "string" && c.phone.trim().length > 0),
    ).length,
  };

  // Agent observability — log the Admin Agent's checklist evaluation
  // each time the operator opens Settings. Counts only, no field
  // values. The actual <AdminChecklistPanel> below re-runs the pure
  // function for its render; double-compute is cheap.
  try {
    const findings = runAdminAgent(adminProfile, adminClients);
    const sum = summarizeAdmin(findings);
    const recommended = sum.missing + sum.warn;
    logAgentEvent({
      agentName: "Admin Agent",
      stepName: "checklist.evaluate",
      status:
        sum.status === "ready"
          ? "complete"
          : sum.status === "review"
            ? "running"
            : "failed",
      message:
        recommended > 0
          ? `${recommended} recommended setup items · ${sum.ready}/${sum.total} complete`
          : `Settings checklist clean · ${sum.ready}/${sum.total} complete`,
    });
  } catch {
    /* never break the render */
  }

  // Inputs need string values. Falling back to NZ defaults for fresh
  // accounts keeps the form populated rather than blank.
  const initial: SettingsInitial = {
    business_name: profile?.business_name ?? "",
    email: profile?.email ?? user.email ?? "",
    phone: profile?.phone ?? "",
    address: profile?.address ?? "",
    gst_number: profile?.gst_number ?? "",
    payment_instructions: profile?.payment_instructions ?? "",
    country: (profile?.country ?? NZ_DEFAULTS.country) || "NZ",
    currency: (profile?.currency ?? NZ_DEFAULTS.currency) || "NZD",
    tax_label: (profile?.tax_label ?? NZ_DEFAULTS.tax_label) || "GST",
    tax_rate:
      typeof profile?.tax_rate === "number"
        ? String(profile.tax_rate)
        : String(NZ_DEFAULTS.tax_rate),
    default_labour_rate:
      typeof profile?.default_labour_rate === "number"
        ? String(profile.default_labour_rate)
        : String(NZ_DEFAULTS.default_labour_rate),
    default_markup_pct:
      typeof profile?.default_markup_pct === "number"
        ? String(profile.default_markup_pct)
        : String(NZ_DEFAULTS.default_markup_pct),
  };

  // Engagement settings (auto follow-ups + review requests). Flag-gated;
  // when both flags are off this whole block is skipped and the section
  // never renders, so the settings page is unchanged by default.
  const reviewsOn = reviewsEnabled();
  const followupsOn = followupsEnabled();
  let engagementInitial = { googleReviewUrl: "", autoReview: false, autoFollowup: false };
  if (reviewsOn || followupsOn) {
    const { data: fs } = await supabase
      .from("feature_settings")
      .select("google_review_url, auto_review_enabled, auto_followup_enabled")
      .eq("user_id", user.id)
      .maybeSingle();
    if (fs) {
      engagementInitial = {
        googleReviewUrl: fs.google_review_url ?? "",
        autoReview: fs.auto_review_enabled,
        autoFollowup: fs.auto_followup_enabled,
      };
    }
  }

  // Deposit payments (Stripe Connect). Flag-gated. On return from Stripe
  // onboarding (?stripe=return) we pull the live account status once;
  // otherwise we read our cached copy. Skipped entirely when the flag is off.
  const paymentsOn = paymentsEnabled();
  let connectStatus: {
    connected: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    depositPct: number;
  } | null = null;
  if (paymentsOn) {
    const sp = await searchParams;
    connectStatus =
      sp?.stripe === "return"
        ? await refreshConnectStatus(user.id)
        : await getConnectStatus(user.id);
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Settings" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-10">
          <div className="t2q-section-label-pro mb-3">{"// your tools"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Settings.
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Business details and quote defaults. Saved values appear on every
            quote PDF and feed the T2Q generator.
          </p>
        </div>

        {/* Wave 36 — prominent guide link near the top of Settings so
            users can find the manual without hunting. The replay button
            restarts the live coachmark tour from the dashboard. */}
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/app/settings/guide"
            data-testid="settings-guide-link"
            className="t2q-card-pro t2q-card-pro-hover flex items-center gap-4 p-4 sm:p-5"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
            >
              <BookOpen size={22} weight="bold" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base uppercase tracking-tight text-white sm:text-lg">
                How to use T2Q.
              </p>
              <p className="mt-0.5 text-sm text-ink-300">
                Full manual — every feature, what it does, how to use it.
              </p>
            </div>
            <ArrowRight
              size={18}
              weight="bold"
              className="shrink-0 text-brand"
              aria-hidden="true"
            />
          </Link>
          <ReplayTourButton />
        </div>

        {/* Wave 14 — Admin Agent checklist moved here from /app/agents
            (which is now owner-only). Every tradie sees their setup
            gaps here, with one-tap links to the field below that fixes
            each item. Read-only. */}
        <AdminChecklistPanel profile={adminProfile} clients={adminClients} />

        {/* Business logo — separate from the settings form (its own upload
            action fires on pick). Renders on every quote/invoice PDF. */}
        <div className="mb-8">
          <BusinessLogoField logoUrl={profile?.logo_url ?? null} />
        </div>

        <SettingsForm initial={initial} />

        {/* Public "Request a quote" link — clients describe a job, it lands
            as a draft quote on this account. Off until the tradie turns it on. */}
        <div className="mt-8">
          <QuoteRequestLinkCard
            initialSlug={profile?.request_slug ?? null}
            appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://tradies2quote.com"}
            hasBusinessName={Boolean(profile?.business_name?.trim())}
          />
        </div>

        {reviewsOn || followupsOn ? (
          <EngagementSettings
            initial={engagementInitial}
            show={{ reviews: reviewsOn, followups: followupsOn }}
          />
        ) : null}

        {paymentsOn && connectStatus ? (
          <PaymentsSettings status={connectStatus} />
        ) : null}

        {/* Billing + subscription. Reads server-side so the panel
            reflects the exact current state without a client round-trip.
            3.1.3(f) — SERVER-gated out of the iOS App Store shell: the
            panel renders "$X/month" + a Stripe billing-portal button, so
            its HTML must never be emitted to the binary at all (a client-
            only hide leaves it in the SSR payload as a catchable flash).
            <HideInNativeApp> stays as defence-in-depth for older shells. */}
        {!(await isNativeShellRequest()) ? (
          <HideInNativeApp>
            <SubscriptionPanel
              status={await getSubscriptionStatus({
                userId: user.id,
                // eslint-disable-next-line react-hooks/purity -- server component, one-shot per request
                signedUpAt: new Date(user.created_at ?? Date.now()),
                email: user.email,
              })}
              stripeConfigured={isStripeConfigured()}
            />
          </HideInNativeApp>
        ) : null}

        {/* AI-consent status + withdrawal (Guideline 5.1.2(i)). Only inside
            the iOS shell, where the consent gate is enforced. */}
        {(await isNativeShellRequest()) ? (
          <AiConsentSetting consentedAt={profile?.ai_consent_at ?? null} />
        ) : null}

        {/* Sign out lives here instead of the app header so the mobile
            top bar can stay compact. Signed-in email is shown for
            context so the user knows whose session they're ending. */}
        <section
          data-testid="settings-sign-out-block"
          className="t2q-card-pro mt-10 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
        >
          <div className="min-w-0">
            <p className="font-display text-sm uppercase tracking-tight text-white">
              Signed in as
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-300">
              {user.email ?? "—"}
            </p>
          </div>
          {/* Wave 13.2 — POSTs to the /auth/signout route handler so
              cookie clearing lands on the redirect response and the
              middleware can't refresh the session. */}
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              data-testid="settings-sign-out"
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-ink-600 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 transition-colors hover:border-brand hover:bg-brand hover:text-ink-900"
            >
              <SignOut size={14} weight="bold" />
              Sign out
            </button>
          </form>
        </section>

        {/* Apple Guideline 5.1.1(v): account deletion must be initiable
            in-app — a support-email-only path is an automatic rejection. */}
        <DeleteAccountSection />
      </main>
    </div>
  );
}
