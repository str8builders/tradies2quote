import Link from "next/link";
import { ArrowRight, Lightning, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { HideInNativeApp } from "@/app/_components/HideInNativeApp";
import { isNativeShellRequest } from "@/lib/native-shell";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import {
  getCachedSubscriptionStatus,
  shouldShowTrialBanner,
} from "@/lib/subscription";
import { NoticeLink } from "../_v2/ui/NoticeStrip";

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
 *
 * `look="new"` (passed by the new-look shell) draws the same banners as a
 * slim ui-token strip (<NoticeLink>) that reads right in dark and outdoor
 * mode. Who sees which banner, and the iPhone app rules below, are the same
 * for both looks.
 */
export async function TrialBanner({ look = "old" }: { look?: "new" | "old" } = {}) {
  const { user } = await getCachedAuthUser();
  if (!user) return null;
  // 3.1.3(f) — every banner here is about paying: "Free access until…" as
  // much as the "$49/mo" ones (it implies paid access after). The iOS App
  // Store shell gets none of their HTML; the <HideInNativeApp> wrappers
  // below stay as defence-in-depth for pre-marker shells.
  if (await isNativeShellRequest()) return null;

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
    if (look === "new") {
      return (
        <NoticeLink
          href="/app/beta"
          data-testid="beta-banner"
          tone="info"
          icon={<ShieldCheck weight="bold" />}
          action="Pre-send checklist"
        >
          Free access until {endsLabel}.
        </NoticeLink>
      );
    }
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

  // Show big red banner for expired users (they're locked out of
  // creating new quotes) and a softer hivis banner during the last
  // 2 days of trial.
  if (sub.state === "expired") {
    if (look === "new") {
      return (
        <HideInNativeApp>
          <NoticeLink
            href="/app/upgrade"
            data-testid="trial-banner-expired"
            tone="bad"
            icon={<Lightning weight="bold" />}
            action="Subscribe for $49 a month"
          >
            Your trial has ended, so new quotes are paused.
          </NoticeLink>
        </HideInNativeApp>
      );
    }
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

  if (look === "new") {
    return (
      <HideInNativeApp>
        <NoticeLink
          href="/app/upgrade"
          data-testid="trial-banner-warning"
          tone="warn"
          icon={<Lightning weight="bold" />}
          action="Subscribe for $49 a month"
        >
          {trialEndsSentence(daysLeft)}
        </NoticeLink>
      </HideInNativeApp>
    );
  }

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

/** The new look's words for the last days: "Your trial ends tomorrow." */
function trialEndsSentence(daysLeft: number): string {
  const when = daysLeft <= 0 ? "today" : daysLeft === 1 ? "tomorrow" : `in ${daysLeft} days`;
  return `Your trial ends ${when}.`;
}
