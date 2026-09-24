"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { UI_TEXT } from "@/components/ui/styles";
import { isFocusedRoute, isLegacyListPath, legacyListRedirect } from "../lib/app-nav";
import { JOBS_PATH } from "../lib/job-board";

/** Shown instead of the old Quotes or Invoices list while Jobs opens. */
function LegacyListNotice() {
  return (
    <div
      role="status"
      data-testid="legacy-list-redirect"
      className={cx("flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 text-center", UI_TEXT)}
    >
      <SpinnerGap
        aria-hidden="true"
        weight="bold"
        className="animate-spin text-[2rem] text-ui-brand-text motion-reduce:animate-none"
      />
      <p className="text-ui-base text-ui-muted">Quotes and invoices live in Jobs now. Opening it…</p>
      <ButtonLink href={JOBS_PATH} variant="ghost">
        Open Jobs
      </ButtonLink>
    </div>
  );
}

/**
 * The content column of the new-look shell (the `.t2q-app-scroll` element
 * of the mobile shell contract: document scroll, normal flow).
 *
 * - Pads the notch on phones, as the old shell does: new-look top bars pass
 *   `safeArea={false}` and stick just below it.
 * - Clears the side rail from `sm` up.
 * - On focused routes the phone tab bar is gone, so the bottom clearance
 *   goes too and the screen's own action bar owns the bottom edge.
 * - The old Quotes and Invoices lists open Jobs instead (their pages are
 *   not ours to edit). This is a full page load on purpose: the layout is
 *   rendered afresh, so the new-look switch can never disagree between
 *   the two hops and bounce.
 */
export function AppContent({ banners, children }: { banners?: ReactNode; children: ReactNode }) {
  const pathname = usePathname();
  const focused = isFocusedRoute(pathname);
  const legacy = isLegacyListPath(pathname);

  useEffect(() => {
    if (!legacy) return;
    window.location.replace(legacyListRedirect(pathname, window.location.search));
  }, [legacy, pathname]);

  return (
    <div
      data-testid="app-content"
      className={cx(
        "t2q-app-scroll min-w-0 pt-[env(safe-area-inset-top)] sm:pt-0 sm:pl-[calc(6rem+env(safe-area-inset-left))]",
        focused && "max-sm:pb-0!",
      )}
    >
      {banners}
      {legacy ? <LegacyListNotice /> : children}
    </div>
  );
}
