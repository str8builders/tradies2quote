import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  CheckCircle,
  Info,
  Lock,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { isStripeConfigured } from "@/lib/stripe-client";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { AppHeader } from "../_components/AppHeader";
import { CheckoutButton } from "./_components/CheckoutButton";

export const metadata: Metadata = {
  title: "Upgrade",
};

export const dynamic = "force-dynamic";

/**
 * /app/upgrade — paywall + checkout entry point.
 *
 * Three states render here:
 *   - trialing → "X days left, no rush, here's the plan"
 *   - expired  → "your trial ended — subscribe to keep going"
 *   - paid     → bounce them straight to settings (already subscribed)
 *
 * Also handles ?stripe=cancelled from the Stripe checkout cancel_url
 * so the user gets a soft "checkout cancelled" note instead of a
 * silent re-land.
 */
export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string; from?: string }>;
}) {
  const { stripe: stripeQuery, from } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // eslint-disable-next-line react-hooks/purity -- server component, one-shot per request
  const signedUpAt = new Date(user.created_at ?? Date.now());
  const sub = await getSubscriptionStatus({
    userId: user.id,
    signedUpAt,
    email: user.email,
  });

  // Already paying? Send them to settings → "Manage subscription" link.
  if (sub.state === "paid") {
    redirect("/app/settings?already=subscribed");
  }

  const cancelled = stripeQuery === "cancelled";
  const stripeReady = isStripeConfigured();

  // 3.1.3(f) — inside the iOS App Store shell this whole page's
  // pricing/checkout content is replaced by a neutral note (no amounts, no
  // billing links — not even a pointer to the website, which the guideline
  // also disallows). SERVER-gated: the priced HTML below is never emitted
  // to the shell at all; the <HideInNativeApp> wrapper further down stays
  // as defence-in-depth for pre-marker shells.
  //
  // ?from=new-quote means the quotes/new gate bounced a trial-expired user
  // here — the copy must be HONEST about that state ("everything works as
  // normal" while quote creation is blocked reads as a broken app) while
  // still steering nowhere.
  const nativeFallback =
    from === "new-quote" ? (
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="t2q-section-label-pro mb-3">{"// account"}</div>
        <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
          New quotes are paused on your account.
        </h1>
        <p className="mt-3 text-sm text-ink-300 sm:text-base">
          Your free trial has ended. You can still view, send and
          download all your existing quotes and invoices — creating
          new ones is paused for now.
        </p>
      </main>
    ) : (
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <div className="t2q-section-label-pro mb-3">{"// account"}</div>
        <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
          Plan management isn&apos;t available in the app.
        </h1>
        <p className="mt-3 text-sm text-ink-300 sm:text-base">
          Your quotes, invoices and clients all keep working as
          normal.
        </p>
      </main>
    );

  if (await isNativeShellRequest()) {
    return (
      <div className="min-h-screen text-white">
        <AppHeader context="Upgrade" />
        {nativeFallback}
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Upgrade" />

      <HideInNativeApp fallback={nativeFallback}>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-8">
          <div className="t2q-section-label-pro mb-3">{"// upgrade"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            {sub.state === "expired"
              ? "Your trial ended."
              : "Keep the lights on."}
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            {sub.state === "expired" ? (
              <>
                You can still <strong className="text-ink-100">view
                and send existing quotes</strong>, but creating new
                ones is paused until you subscribe.
              </>
            ) : (
              <>
                {sub.trialDaysLeft === 1
                  ? "Last day of your free trial. "
                  : sub.trialDaysLeft && sub.trialDaysLeft > 0
                    ? `${sub.trialDaysLeft} days left in your free trial. `
                    : ""}
                Subscribe now and the app keeps working the second your
                trial ends — no interruption.
              </>
            )}
          </p>
        </div>

        {cancelled && (
          <p
            data-testid="upgrade-cancelled"
            role="status"
            className="mb-6 rounded-sm border border-hivis/40 bg-hivis/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-hivis"
          >
            {"// checkout cancelled — nothing was charged."}
          </p>
        )}

        <section
          aria-label="Plan"
          data-testid="upgrade-plan-card"
          className="t2q-card-pro p-6 sm:p-8"
        >
          <div className="flex items-baseline gap-2">
            <Sparkle size={18} weight="fill" className="text-brand" />
            <p className="t2q-section-label-pro !text-brand">{"// pro"}</p>
          </div>
          <h2 className="mt-2 font-display text-2xl uppercase tracking-tight text-white sm:text-3xl">
            tradies2Quote Pro
          </h2>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="font-display text-4xl text-brand sm:text-5xl">
              $49
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">
              NZD / month · incl. GST
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Cancel anytime from settings — no contracts, no annual lock-in.
          </p>

          <ul className="mt-6 space-y-2.5 text-sm text-ink-100">
            <Bullet>Unlimited voice-to-quote generation</Bullet>
            <Bullet>Unlimited quote sends (email + SMS)</Bullet>
            <Bullet>Invoice generation, send + mark-paid</Bullet>
            <Bullet>Branded PDFs with your logo</Bullet>
            <Bullet>Materials library + supplier price import</Bullet>
            <Bullet>All T2Q agents (compliance, voice cleanup, follow-up, more)</Bullet>
            <Bullet>NZ Building Code + GST compliance baked in</Bullet>
          </ul>

          <div className="mt-7">
            {stripeReady ? (
              <CheckoutButton />
            ) : (
              <p
                data-testid="upgrade-stripe-missing"
                className="inline-flex items-center gap-2 rounded-sm border border-hivis/40 bg-hivis/10 px-3 py-2 text-xs text-hivis"
              >
                <Lock size={14} weight="bold" />
                Paid plans open soon. Your trial keeps running free until
                checkout is switched on — nothing to do for now.
              </p>
            )}
          </div>

          <p className="mt-5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            <Info size={12} weight="bold" />
            Payment is processed by Stripe — your card never touches our
            servers. NZ GST handled by Stripe Tax.
          </p>
        </section>
      </main>
      </HideInNativeApp>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle
        size={16}
        weight="fill"
        className="mt-0.5 shrink-0 text-brand"
      />
      <span>{children}</span>
    </li>
  );
}
