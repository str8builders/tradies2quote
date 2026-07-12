import { SideMeasureTape } from "../_components/app/SideMeasureTape";
import AppSplash from "./_components/AppSplash";
import { MobileAppMenu } from "./_components/MobileAppMenu";
import { OnboardingTourGate } from "./_components/OnboardingTourGate";
import { TopProgressBar } from "./_components/TopProgressBar";
import { TrialBanner } from "./_components/TrialBanner";
import { BetaNoticeBanner } from "./_components/BetaNoticeBanner";

/**
 * Visual layout for /app/* routes.
 *
 * MOBILE SHELL CONTRACT — see docs/mobile-shell-contract.md before changing the
 * shell. The iOS-PWA safe-area shell has exactly four single owners:
 *   • root fallback paint  → html/body (globals.css)
 *   • app page paint       → `.t2q-app-canvas` (this div, `min-h-dvh`; normal flow)
 *   • scrolling            → the document (no nested scroll container)
 *   • bottom safe-area     → `.t2q-bottomnav-bar` (fixed; bottom:0; padding-bottom env)
 * `.t2q-app-scroll` below is NOT a scroll owner — it only pads content to clear
 * the nav. Do NOT reintroduce a `position: fixed; inset: 0` canvas, an
 * `overflow: hidden; height: 100%` scroll-lock, forced-white backgrounds, or a
 * route-level themeColor override — that combination caused the bottom-strip
 * regression.
 *
 * Wave 15.2 — restoration of the tape-measure entry splash:
 *   - `<LoadingScreen>` is mounted back at the top of the tree. It's
 *     gated by sessionStorage (6h skip window) so it only plays on the
 *     first /app entry per browsing session, not on every navigation.
 *   - The same component used to render with `useState(false)` and
 *     fade in after mount, which caused the dashboard to flash for a
 *     moment before the splash appeared. Wave 15.2 flips its initial
 *     state to `true` so the splash is in the server-rendered HTML —
 *     no protected UI is ever painted before it.
 *   - The mobile header (logo + avatar + black strip) is hidden again
 *     via `hidden sm:block` in <AppHeaderClient>. Mobile uses compact
 *     fixed controls for navigation and account access.
 *   - Because the mobile header is gone again, the wrapper restores
 *     its own `pt-[env(safe-area-inset-top)] sm:pt-0` so phone
 *     content still sits below the notch.
 *
 * The route-level `loading.tsx` next to this file now returns null —
 * no more brand splash between tabs.
 *
 * Auth gating is unchanged. This layout does NOT call
 * `supabase.auth.getUser()`, does NOT redirect, does NOT fetch data.
 * Auth still happens in `src/proxy.ts` and as defense-in-depth at the
 * top of each `/app/*` page's server component.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      data-shell="app"
      data-theme="light"
      className="t2q-app-canvas min-h-dvh w-full max-w-full overflow-x-clip lg:grid lg:grid-cols-[24px_1fr_24px]"
    >
      {/*
        Status-bar safe-area guard. Kept transparent so the installed
        app feels full-screen edge-to-edge under the notch.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] bg-transparent"
      />
      {/* Soft-serif app splash. Renders once per session — the
          sessionStorage check inside the component decides whether to
          play or skip on each /app entry. Server-rendered visible so
          there's no flash of dashboard before it appears. */}
      <AppSplash
        storageKey="t2q-app-splash-shown"
        tagline="Voice in. Quote out."
        holdMs={2600}
      />
      <SideMeasureTape />
      {/* App content scroll region. Canonical mobile shell (see globals.css
          `@media (max-width: 639px)`): the page is normal document flow; the
          bottom nav (`.t2q-bottomnav-bar`, rendered by <MobileAppMenu/> below)
          is `position:fixed; bottom:0` and its OWN background + safe-area
          padding paint the home-indicator zone — so the nav alone owns the
          bottom edge. globals.css pads this region's bottom to clear the nav.

          Safe-area handling: the top notch inset lives here
          (`pt-[env(safe-area-inset-top)]`, dropped at `sm` where the header
          owns it). The bottom inset is owned by the nav's own padding/background
          (single source of truth in globals.css). AppHeader is `hidden sm:block`,
          so phones use the bottom nav + the top-right account avatar. */}
      <div className="t2q-app-scroll min-w-0 pt-[env(safe-area-inset-top)] sm:pt-0 lg:col-start-2">
        {/* Trial / expired upgrade banner. Server-rendered: renders
            nothing for paid users or users still well inside their
            trial; surfaces only when there's something to act on. */}
        <TrialBanner />
        {/* Dismissible beta safety reminder — once per session, client-side
            (sessionStorage). Sits below the trial/beta-payments banner. */}
        <BetaNoticeBanner />
        {children}
      </div>
      <div aria-hidden="true" className="hidden lg:block" />
      <MobileAppMenu />
      {/* Top-of-screen progress bar for /app/* tab navigations. Fires
          on pathname change, animates for ~700ms, then fades. Skips
          the first render so it doesn't compete with the brand splash
          on app entry. */}
      <TopProgressBar />
      {/* First-run onboarding tour. The Gate self-checks
          `localStorage["t2q-tour-done"]` on the client and ONLY
          triggers the dynamic import of the heavy tour UI if the user
          hasn't dismissed it yet. Returning users never fetch the
          tour's JS chunk. */}
      <OnboardingTourGate />
    </div>
  );
}
