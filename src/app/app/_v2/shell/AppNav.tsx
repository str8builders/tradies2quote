"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Icon } from "@phosphor-icons/react";
import { Briefcase, DotsThree, House, Plus, Tag } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { TAP, UI_TEXT } from "@/components/ui/styles";
import { APP_TABS, activeTab, isFocusedRoute, type AppTab, type AppTabId } from "../lib/app-nav";

const ICON: Readonly<Record<AppTabId, Icon>> = {
  home: House,
  jobs: Briefcase,
  new: Plus,
  prices: Tag,
  more: DotsThree,
};

const LINK = cx(
  "ui-focus-ring flex w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-ui-md px-1 text-ui-xs font-semibold no-underline",
  TAP,
);

function NavLink({ tab, current }: { tab: AppTab; current: boolean }) {
  const TabIcon = ICON[tab.id];
  if (tab.id === "new") {
    // The raised orange New (+): the one action every screen can reach.
    return (
      <Link
        href={tab.href}
        prefetch
        aria-label={tab.name}
        aria-current={current ? "page" : undefined}
        data-testid="app-nav-new"
        className={cx(LINK, "min-h-14 text-ui-text sm:min-h-20")}
      >
        <span
          aria-hidden="true"
          className={cx(
            "ui-brand-gradient -mt-5 inline-flex h-14 w-14 items-center justify-center rounded-ui-lg text-[1.625rem] text-ui-on-brand shadow-ui-raised ring-4 ring-ui-bg sm:mt-0 sm:h-12 sm:w-12 sm:ring-0",
            current && "outline-2 outline-offset-2 outline-ui-text",
          )}
        >
          <TabIcon weight="bold" />
        </span>
        <span aria-hidden="true" className="sm:hidden">
          {tab.label}
        </span>
        <span aria-hidden="true" className="hidden sm:inline">
          {tab.name}
        </span>
      </Link>
    );
  }
  return (
    <Link
      href={tab.href}
      prefetch
      aria-current={current ? "page" : undefined}
      data-testid={`app-nav-${tab.id}`}
      className={cx(
        LINK,
        "min-h-14 sm:min-h-16",
        current ? "text-ui-brand-text sm:bg-ui-surface-2" : "text-ui-muted hover:text-ui-text",
      )}
    >
      <TabIcon aria-hidden="true" weight={current ? "fill" : "duotone"} className="text-[1.5rem]" />
      <span className="max-w-full truncate">{tab.label}</span>
    </Link>
  );
}

/**
 * The new-look navigation, one element for every screen size.
 *
 * Phones: a bar docked to the bottom edge (Home, Jobs, a raised New (+),
 * Prices, More). It paints the home-indicator zone itself. The shell's
 * `.t2q-app-scroll` clearance (5.8rem + inset) is taller than the bar
 * (4rem + inset, the New tile rising 1rem), so fixed bars docked at
 * 5.3rem + inset still sit clear above it.
 *
 * From `sm` up: the same five as a rail down the left, clear of a landscape
 * notch.
 *
 * The current tab is marked with aria-current and a filled icon, not colour
 * alone. Tabs prefetch in full, like the old bottom nav, so a tap on site
 * lands at once. On focused routes (the new-quote flow, the job page) the
 * phone bar steps aside for the screen's own bottom action bar; the rail
 * stays.
 */
export function AppNav() {
  const pathname = usePathname();
  const current = activeTab(pathname);
  const focused = isFocusedRoute(pathname);
  return (
    <nav
      aria-label="Main"
      data-testid="app-nav"
      data-focused={focused ? "true" : undefined}
      className={cx(
        "fixed right-0 bottom-0 left-0 z-40 border-t border-ui-line bg-ui-bg pb-[env(safe-area-inset-bottom)]",
        "sm:top-0 sm:right-auto sm:w-[calc(6rem+env(safe-area-inset-left))] sm:border-t-0 sm:border-r sm:pb-0 sm:pl-[env(safe-area-inset-left)]",
        focused && "max-sm:hidden",
        UI_TEXT,
      )}
    >
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5 items-center px-1 sm:h-auto sm:max-w-none sm:grid-cols-1 sm:gap-2 sm:px-2 sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
        {APP_TABS.map((tab) => (
          <li key={tab.id} className="flex min-w-0 justify-center">
            <NavLink tab={tab} current={current === tab.id} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
