"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { isWeatherImpactEnabled } from "@/lib/weather-impact/feature-flag";
import { SPRING_SNAPPY } from "./motion";

/**
 * Wave 17 — perf — see MobileAppMenuClient.tsx for the rationale.
 * Same `AccountHub` is used here (desktop dropdown variant via the
 * `mode="panel"` prop). Splitting it into its own chunk that's only
 * fetched when the avatar trigger is clicked.
 */
const AccountHub = dynamic(
  () => import("./AccountHub").then((m) => m.AccountHub),
  { ssr: false, loading: () => null },
);

/**
 * Client part of the shared `/app/*` header.
 *
 * Wave 13 — owner-only tab gating (Agents). Non-owners see a 4-tab
 * strip; owner sees 5.
 *
 * Wave 14.3 — was hidden on mobile to claw back vertical space.
 *
 * Wave 15 — the header is back on mobile, but compact: just the logo
 * top-left and an avatar trigger top-right. The full tab strip stays
 * desktop-only. The Settings / SignOut chip cluster is GONE — those
 * actions live inside the account hub now (Profile / Business / Quote
 * defaults / Invoice defaults / Clients / Sign out + owner shortcuts).
 *
 * The avatar trigger opens a dropdown panel anchored top-right (`mode:
 * "panel"`) on sm+. Mobile uses its own fixed account shortcut.
 */
interface Props {
  context?: string;
  isOwner: boolean;
  userEmail: string | null;
  avatarUrl: string | null;
}

const TABS = [
  { href: "/app", label: "Dashboard", ownerOnly: false },
  { href: "/app/quotes", label: "Quotes", ownerOnly: false },
  { href: "/app/invoices", label: "Invoices", ownerOnly: false },
  { href: "/app/materials", label: "Materials", ownerOnly: false },
  { href: "/app/weather", label: "Weather", ownerOnly: false },
  // Wave 13: Agents tab is owner-only.
  { href: "/app/agents", label: "Agents", ownerOnly: true },
  { href: "/app/clients", label: "Clients", ownerOnly: false },
] as const;

/** Tabs whose feature is flag-parked vanish from the strip entirely — a
 *  visible tab must never open a locked "owner testing" screen (2.1). */
function isTabVisible(tab: (typeof TABS)[number], isOwner: boolean): boolean {
  if (tab.ownerOnly && !isOwner) return false;
  if (tab.href === "/app/weather") return isWeatherImpactEnabled(isOwner);
  return true;
}

function isActiveTab(href: string, pathname: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppHeaderClient({
  context,
  isOwner,
  userEmail,
  avatarUrl,
}: Props) {
  const pathname = usePathname() ?? "";
  const reduce = useReducedMotion();
  const visibleTabs = TABS.filter((t) => isTabVisible(t, isOwner));
  const initial = (userEmail ?? "?").trim().charAt(0).toUpperCase() || "?";

  // Avatar dropdown state — desktop only. Close on outside-click and
  // on route change (which fires a usePathname update).
  const [hubOpen, setHubOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hubOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setHubOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHubOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [hubOpen]);
  // Close the panel on route change so the user doesn't land on the
  // new page with a stale open menu.
  useEffect(() => {
    // Defer so the state write isn't synchronous inside the effect body
    // (React 19 react-hooks/set-state-in-effect).
    const t = setTimeout(() => setHubOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <header
      data-testid="app-header"
      data-is-owner={isOwner ? "true" : "false"}
      // Wave 15.2/43 — hidden on mobile. Phones use fixed round controls
      // for navigation and account access, keeping the dashboard viewport
      // open. Desktop keeps the header tabs + avatar dropdown.
      className="hidden sm:block sticky top-0 z-30 border-b border-ink-700/60 bg-ink-950/85 pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="mx-auto flex h-12 max-w-3xl items-center justify-between gap-3 px-3 sm:h-16 sm:max-w-5xl sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/app"
            data-testid="app-header-home"
            aria-label="Tradies2Quote dashboard"
            className="t2q-logo-chip inline-flex shrink-0 items-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-horizontal.png?v=21"
              alt="Tradies2Quote"
              width={1084}
              height={512}
              className="block h-6 w-auto sm:h-7"
            />
          </Link>
          {context ? (
            <span
              data-testid="app-header-context"
              className="hidden min-w-0 items-center gap-2 font-mono text-xs uppercase tracking-[0.25em] text-ink-400 sm:inline-flex"
            >
              <span aria-hidden="true" className="text-ink-600">
                ·
              </span>
              <span className="truncate">{context}</span>
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <nav
            data-testid="app-header-tabs"
            aria-label="Primary"
            className="hidden items-center gap-1 sm:flex"
          >
            {visibleTabs.map((tab) => {
              const active = isActiveTab(tab.href, pathname);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className="t2q-nav-tab"
                  aria-current={active ? "page" : undefined}
                  data-testid={`app-header-tab-${tab.label.toLowerCase()}`}
                >
                  {/* Wave 45 — active highlight + underline slide between
                      tabs via shared layoutId (the static CSS rule keeps
                      only the text colour). */}
                  {active ? (
                    <motion.span
                      layoutId="t2q-header-tab-pill"
                      aria-hidden="true"
                      transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
                      className="absolute inset-0 rounded-[0.125rem] border border-[rgba(255,95,21,0.4)] bg-[rgba(255,95,21,0.1)]"
                      style={{ boxShadow: "inset 0 -2px 0 0 #FF5F15" }}
                    />
                  ) : null}
                  <span className="relative">{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Avatar trigger. On desktop it pops a hub panel; on mobile
              it's a safety-net link to /app/settings (the mobile bottom
              nav owns the primary avatar action). */}
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              data-testid="app-header-avatar"
              data-tour="account-menu"
              aria-haspopup="menu"
              aria-expanded={hubOpen}
              aria-label="Account hub"
              onClick={() => setHubOpen((v) => !v)}
              className="t2q-avatar-online inline-flex h-9 items-center justify-center rounded-full border border-ink-700 bg-ink-900/80 px-0.5 transition-colors hover:border-brand"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-ink-900 font-display text-sm leading-none"
                >
                  {initial}
                </span>
              )}
            </button>

            {hubOpen ? (
              <div
                ref={panelRef}
                data-testid="app-header-account-panel"
                className="absolute right-0 top-[calc(100%+8px)] z-40"
              >
                <AccountHub
                  mode="panel"
                  isOwner={isOwner}
                  userEmail={userEmail}
                  avatarUrl={avatarUrl}
                  onClose={() => setHubOpen(false)}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
