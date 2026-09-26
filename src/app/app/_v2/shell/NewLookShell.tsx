import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { contrastAttributeValue } from "@/lib/ui/outdoor";
import { BetaNoticeBanner } from "../../_components/BetaNoticeBanner";
import { TopProgressBar } from "../../_components/TopProgressBar";
import { TrialBanner } from "../../_components/TrialBanner";
import { AppContent } from "./AppContent";
import { AppNav } from "./AppNav";
import { LocationBridge } from "./LocationBridge";
import { StatusBarTint } from "./StatusBarTint";

/**
 * The site-wide "pause motion" choice (landing footer toggle →
 * html[data-motion="paused"]) sets `animation-play-state: paused` on
 * everything in `.studio-app` (redesign.css). A kit sheet or toast would
 * freeze mid-slide, off screen. In the new look those short animations are
 * skipped instead, so a paused choice means "no motion", never "stuck".
 */
const SETTLE_KIT_MOTION =
  "[[data-motion=paused]_&_[class*='animate-ui-']]:animate-none!";

/**
 * The /app shell in the new look (src/app/app/layout.tsx switches to it when
 * isNewLookOn()). Same shell contract as the old one — see
 * docs/mobile-shell-contract.md, "New look" addendum:
 *
 *   - page paint: this canvas, solid ui-bg (follows outdoor mode), normal
 *     flow, min-h-dvh, no fixed positioning; `studio-app` stays so pages not
 *     yet redesigned keep their look.
 *   - scrolling: the document (<AppContent> is `.t2q-app-scroll`).
 *   - top safe area: <AppContent> pads it; the strip above paints it so
 *     nothing scrolls visibly under the status bar. In the iPhone app the
 *     strip is the page's own colour (no band) and <StatusBarTint> sets the
 *     clock to match; in a home-screen web app it stays the dark chrome,
 *     because iOS always draws that clock white.
 *   - bottom safe area: the docked tab bar (<AppNav>) on phones, or the
 *     screen's own bottom action bar on focused routes.
 *
 * Left out on purpose: the old welcome video (AppSplash), the coachmark
 * tour, the side tape and the old mobile menu. <NewLookWelcome> (a short
 * greeting, passed in as `welcome`) and Home's setup card replace the first
 * two; the tab bar and rail replace the menus.
 */
export function NewLookShell({
  outdoor,
  inApp = false,
  welcome,
  children,
}: {
  outdoor: boolean;
  /** This request comes from the iPhone app (isNativeShellRequest). */
  inApp?: boolean;
  /** The welcome after signing in (<NewLookWelcome>), when it may play. */
  welcome?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <div
        data-shell="app"
        data-theme="dark"
        data-look="new"
        data-contrast-root=""
        data-contrast={contrastAttributeValue(outdoor)}
        className={cx(
          "studio-app t2q-app-canvas min-h-dvh w-full max-w-full overflow-x-clip bg-ui-bg!",
          SETTLE_KIT_MOTION,
        )}
      >
        <div
          aria-hidden="true"
          data-testid="status-bar-strip"
          className={cx(
            "pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)]",
            inApp ? "bg-ui-bg" : "bg-ui-chrome",
          )}
        />
        <AppContent
          banners={
            <>
              <TrialBanner />
              <BetaNoticeBanner />
            </>
          }
        >
          {children}
        </AppContent>
        <AppNav />
        <TopProgressBar />
        <LocationBridge />
        {inApp ? <StatusBarTint outdoor={outdoor} /> : null}
      </div>
      {/* Outside the canvas, which is its own stacking context; the welcome
        lifts itself into the browser's top layer once it runs. */}
      {welcome}
    </>
  );
}
