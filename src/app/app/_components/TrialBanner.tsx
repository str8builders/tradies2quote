import Link from "next/link";
import { ArrowRight, Lightning, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import {
  getCachedSubscriptionStatus,
  shouldShowTrialBanner,
} from "@/lib/subscription";

/**
 * Sticky-ish top banner that appears in two cases:
 *   - last 2 days of trial → "Trial ends in N days, upgrade now"
 *   - trial expired, no sub → "Read-only — upgrade to keep going"
 *
 * Hidden completely for:
 *   - users still mid-trial with >2 days left
 *   - users on an active paid subscription
 *
 * Rendered as a server component inside the /app layout so it shows on
 * every authenticated page. Reads supabase once per render (cheap
 * because the layout is already paying for an auth cookie read).
 */
export async function TrialBanner() {
  const { user } = await getCachedAuthUser();
  if (!user) return null;

  const sub = await getCachedSubscriptionStatus(
    user.id,
    user.created_at ?? null,
    user.email,
  );

  // Beta window — universal free access, render a celebratory banner
  // so the tradie (and their mates) know payments are paused. Self-
  // expires when BETA_FREE_UNTIL passes.
  if (sub.betaFreeUntil) {
    const endsLabel = sub.betaFreeUntil.toLocaleDateString("en-NZ", {
      day: "numeric",
      month: "short",
    });
    return (
      <Link
        href="/app/beta"
        data-testid="beta-banner"
        className="block border-b border-white/[0.06] bg-white/[0.025] px-4 py-2.5 transition-colors hover:bg-white/[0.04] sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-200">
            <ShieldCheck size={14} weight="bold" className="text-brand" />
            Free access active until {endsLabel}
          </p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-brand">
            Pre-send checklist
            <ArrowRight size={12} weight="bold" />
          </span>
        </div>
      </Link>
    );
  }

  if (sub.state === "paid") return null;

  // 3.1.3(f) — the two banners below carry "$49/mo" + an upgrade link, so
  // the iOS App Store shell must never receive their HTML at all. The
  // server-side UA gate is authoritative; the <HideInNativeApp> wrappers
  // below stay as defence-in-depth for pre-marker shells.
  if (await isNativeShellRequest()) return null;

  // Show big red banner for expired users (they're locked out of
  // creating new quotes) and a softer hivis banner during the last
  // 2 days of trial.
  if (sub.state === "expired") {
    return (
      <HideInNativeApp>
      <Link
        href="/app/upgrade"
        data-testid="trial-banner-expired"
        className="block border-b border-red-500/40 bg-red-500/15 px-4 py-2.5 hover:bg-red-500/20 sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-red-300">
            <Lightning size={14} weight="bold" />
            Trial ended · Read-only mode · New quotes paused
          </p>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white">
            Subscribe — $49/mo
            <ArrowRight size={12} weight="bold" />
          </span>
        </div>
      </Link>
      </HideInNativeApp>
    );
  }

  if (!shouldShowTrialBanner(sub)) return null;

  const daysLeft = sub.trialDaysLeft ?? 0;
  const label =
    daysLeft <= 0
      ? "Trial ends today"
      : daysLeft === 1
        ? "Trial ends tomorrow"
        : `Trial ends in ${daysLeft} days`;

  return (
    <HideInNativeApp>
    <Link
      href="/app/upgrade"
      data-testid="trial-banner-warning"
      className="block border-b border-hivis/40 bg-hivis/10 px-4 py-2.5 hover:bg-hivis/15 sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-hivis">
          <Lightning size={14} weight="bold" />
          {label} — keep things flowing
        </p>
        <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em] text-white">
          Subscribe — $49/mo
          <ArrowRight size={12} weight="bold" />
        </span>
      </div>
    </Link>
    </HideInNativeApp>
  );
}
