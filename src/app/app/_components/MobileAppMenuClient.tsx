"use client";

import { useRef, useState } from "react";
import { AccountHub } from "./AccountHub";
import { AccountButton } from "./AccountButton";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { SPRING_SNAPPY } from "./motion";
import type { Icon } from "@phosphor-icons/react";
import {
  House,
  ListBullets,
  Plus,
  Receipt,
  Stack,
} from "@phosphor-icons/react";

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
  { href: "/app", label: "Home", icon: House, testId: "home" },
  { href: "/app/quotes", label: "Quotes", icon: ListBullets, testId: "quotes" },
  { href: "/app/invoices", label: "Invoices", icon: Receipt, testId: "invoices" },
  { href: "/app/materials", label: "Materials", icon: Stack, testId: "materials" },
];

function isActive(href: string, pathname: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileAppMenuClient({ isOwner, userEmail, avatarUrl }: Props) {
  const pathname = usePathname() ?? "";
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduce = useReducedMotion();
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
  const pill = (
    <motion.span
      layoutId="t2q-bottomnav-pill"
      aria-hidden="true"
      transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
      className="absolute inset-0 rounded-[0.85rem] border border-[#FFD4B8] bg-[var(--t2q-app-orange-soft,#FFF1EA)] shadow-[inset_0_-2px_0_#FF5F15]"
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
          size={23}
          weight={active ? "fill" : "regular"}
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
          <Plus size={26} weight="bold" aria-hidden="true" />
        </Link>
        {TABS.slice(2).map(renderTab)}
      </nav>

      <AnimatePresence>
        {sheetOpen ? (
          <motion.div
            data-testid="account-sheet"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0.1 : 0.2 }}
            className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm sm:hidden"
            onClick={closeSheet}
          >
            {/* A short, non-overshooting entrance keeps the profile steady. */}
            <motion.div
              initial={reduce ? { y: 0 } : { y: "100%" }}
              animate={{ y: 0 }}
              exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full"
            >
              <AccountHub
                mode="sheet"
                isOwner={isOwner}
                userEmail={userEmail}
                avatarUrl={avatarUrl}
                onClose={closeSheet}
              />
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
