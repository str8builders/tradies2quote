"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AccountHub } from "./AccountHub";
import { AccountButton } from "./AccountButton";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import type { Icon } from "@phosphor-icons/react";
import {
  HouseLine,
  FileText,
  Plus,
  Receipt,
  Package,
} from "@phosphor-icons/react";

/**
 * Wave 46 perf — the sliding tab-highlight is the only framer-motion user
 * left in this menu, so it's split into its own chunk and loaded only on
 * the client. `loading` renders the same highlight WITHOUT the cross-tab
 * slide (a plain static box) so there's no layout shift while the chunk
 * downloads; see AnimatedTabPill.tsx for why this piece keeps framer-motion.
 * The account sheet below (backdrop + slide-up panel) no longer needs
 * framer-motion at all — it's driven by the `.t2q-sheet-*` CSS animations
 * in globals.css.
 */
const BOTTOMNAV_PILL_CLASSNAME = "t2q-bottomnav-active absolute inset-0 rounded-[0.85rem]";
const AnimatedTabPill = dynamic(
  () => import("./AnimatedTabPill").then((m) => m.AnimatedTabPill),
  {
    ssr: false,
    loading: () => (
      <span aria-hidden="true" className={BOTTOMNAV_PILL_CLASSNAME} />
    ),
  },
);

/**
 * Client part of the mobile navigation.
 *
 * Wave 13 — `isOwner` is plumbed in from the server wrapper so the
 * AccountHub can keep owner-only shortcuts gated.
 *
 * Wave 14.4 — added a mobile avatar shortcut that opens a slide-up
 * sheet with Settings + Clients + Sign out.
 *
 * Wave 15 — sheet body extracted to `<AccountHub mode="sheet">`. The
 * sheet now carries Profile / Business / Quote defaults / Invoice
 * defaults / Clients / Avatar upload field + owner-only shortcuts
 * (Agents, Debug, Monitor dashboard). Non-owners never see those.
 *
 * Wave 44 — mobile navigation is a light bottom tab bar that follows
 * the app surface/orange/muted-neutral colour system.
 */
interface Props {
  isOwner: boolean;
  userEmail: string | null;
  /** Wave 15 — passed through so the sheet's avatar field can show the
   *  image when present and fall back to the initial when not. */
  avatarUrl: string | null;
}

const TABS: ReadonlyArray<{
  href: string;
  label: string;
  icon: Icon;
  testId: string;
}> = [
  { href: "/app", label: "Home", icon: HouseLine, testId: "home" },
  { href: "/app/quotes", label: "Quotes", icon: FileText, testId: "quotes" },
  { href: "/app/invoices", label: "Invoices", icon: Receipt, testId: "invoices" },
  { href: "/app/materials", label: "Materials", icon: Package, testId: "materials" },
];

function isActive(href: string, pathname: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileAppMenuClient({ isOwner, userEmail, avatarUrl }: Props) {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);
  // Scoped scroll-lock: while the account sheet is open the document must
  // not scroll behind the backdrop (iOS ignores overflow:hidden for touch
  // scrolling). Fully reverted + scroll position restored on close — the
  // document remains the shell's single scroll owner (see
  // docs/mobile-shell-contract.md; this is not the banned general lock).
  const releaseScrollLock = useBodyScrollLock(sheetOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeSheet = () => {
    releaseScrollLock();
    setSheetOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const newQuoteActive = pathname === "/app/quotes/new";

  // Wave 45 — the active-tab pill is a SEPARATE background element that
  // slides between tabs via framer's shared `layoutId`. The tab itself
  // never transforms (shell-contract ban on press movement); only this
  // decorative span moves. Reduced motion → the pill just swaps, no slide.
  // Wave 46 — lazy-loaded; see AnimatedTabPill above.
  const pill = (
    <AnimatedTabPill
      layoutId="t2q-bottomnav-pill"
      className={BOTTOMNAV_PILL_CLASSNAME}
    />
  );

  const renderTab = ({ href, label, icon: IconCmp, testId }: (typeof TABS)[number]) => {
    const active = isActive(href, pathname) && !newQuoteActive;
    return (
      <Link
        key={href}
        href={href}
        prefetch={true}
        aria-current={active ? "page" : undefined}
        data-testid={`app-bottom-nav-${testId}`}
        className="t2q-bottomnav-tab relative"
      >
        {active ? pill : null}
        <IconCmp
          className="t2q-bottomnav-icon relative"
          size={24}
          weight={active ? "fill" : "duotone"}
          aria-hidden="true"
        />
        <span className="relative">{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* Mobile account shortcut. Navigation lives in the bottom tab bar;
          this stays top-right for profile, settings, clients, and sign out. */}
      <AccountButton
        ref={triggerRef}
        userEmail={userEmail}
        avatarUrl={avatarUrl}
        data-testid="app-account-avatar"
        data-tour="account-menu"
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen(true)}
        className="t2q-account-avatar sm:hidden"
      />

      <nav
        data-testid="app-bottom-nav"
        data-app-section={pathname.split("/")[2] || "dashboard"}
        data-tour="mobile-navigation"
        aria-label="App navigation"
        className="t2q-bottomnav-bar sm:hidden"
      >
        {TABS.slice(0, 2).map(renderTab)}
        {/* Central raised "+" disc (mockup parity) — icon-only; the
            accessible name is the aria-label. Active state is its own
            ring (no sliding pill on a circle). */}
        <Link
          href="/app/quotes/new"
          prefetch={true}
          aria-label="New quote"
          aria-current={newQuoteActive ? "page" : undefined}
          data-testid="app-bottom-nav-new-quote"
          className="t2q-bottomnav-plus"
        >
          <Plus size={23} weight="bold" aria-hidden="true" />
          <span className="t2q-bottomnav-new-label" aria-hidden="true">New</span>
        </Link>
        {TABS.slice(2).map(renderTab)}
      </nav>

      {/* Wave 46 — converted from framer-motion's AnimatePresence to plain
          CSS keyframe animations (`.t2q-sheet-backdrop` / `.t2q-sheet-panel`
          in globals.css), matching the enter-only pattern already used for
          the page-enter transition and dashboard stagger: the entrance
          (backdrop fade + panel slide-up) is animated, honouring
          prefers-reduced-motion in the stylesheet; closing unmounts
          immediately, same as the desktop account panel below already did. */}
      {sheetOpen ? (
        <div
          data-testid="account-sheet"
          className="t2q-sheet-backdrop fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:hidden"
          onClick={closeSheet}
        >
          <div
            className="t2q-sheet-panel w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <AccountHub
              mode="sheet"
              isOwner={isOwner}
              userEmail={userEmail}
              avatarUrl={avatarUrl}
              onClose={closeSheet}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
