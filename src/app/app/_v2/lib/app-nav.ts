/**
 * New-look navigation, as data (pure, tested in node).
 *
 *   - The five tabs: Home · Jobs · New (+) · Prices · More.
 *   - Which tab a path belongs to (the highlighted one).
 *   - Focused routes: task screens that own the bottom edge of a phone with
 *     their own action bar, so the tab bar steps aside there.
 *   - The simple top bar that pages not yet redesigned get in the new look.
 *   - Where the old Quotes and Invoices lists send people in the new look.
 */

import {
  jobsFilterForInvoiceStatus,
  jobsFilterForQuoteStage,
  jobsHref,
  JOBS_PATH,
} from "./job-board";

export type AppTabId = "home" | "jobs" | "new" | "prices" | "more";

export interface AppTab {
  id: AppTabId;
  /** The word under the icon on a phone. */
  label: string;
  /** The word in the desktop rail (and the tab's accessible name). */
  name: string;
  href: string;
}

export const HOME_PATH = "/app";
export const NEW_QUOTE_PATH = "/app/quotes/new";
export const PRICES_PATH = "/app/materials";
export const MORE_PATH = "/app/more";

export const APP_TABS: readonly AppTab[] = [
  { id: "home", label: "Home", name: "Home", href: HOME_PATH },
  { id: "jobs", label: "Jobs", name: "Jobs", href: JOBS_PATH },
  { id: "new", label: "New", name: "New quote", href: NEW_QUOTE_PATH },
  { id: "prices", label: "Prices", name: "Prices", href: PRICES_PATH },
  { id: "more", label: "More", name: "More", href: MORE_PATH },
];

/** "/app/jobs/" → "/app/jobs"; query and hash dropped. */
export function normalizePath(pathname: string | null | undefined): string {
  const path = (pathname ?? "").split(/[?#]/)[0] ?? "";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

function under(path: string, base: string): boolean {
  return path === base || path.startsWith(`${base}/`);
}

const JOBS_AREAS = [JOBS_PATH, "/app/quotes", "/app/invoices", "/app/requests"];
const PRICES_AREAS = [PRICES_PATH, "/app/suppliers"];
const MORE_AREAS = [
  MORE_PATH,
  "/app/settings",
  "/app/clients",
  "/app/team",
  "/app/templates",
  "/app/beta",
  "/app/upgrade",
  "/app/agents",
  "/app/debug",
  "/app/admin",
];

/** The tab to highlight for a path; null when none fits. */
export function activeTab(pathname: string | null | undefined): AppTabId | null {
  const path = normalizePath(pathname);
  if (path === HOME_PATH || under(path, "/app/weather")) return "home";
  if (under(path, NEW_QUOTE_PATH)) return "new";
  if (JOBS_AREAS.some((base) => under(path, base))) return "jobs";
  if (PRICES_AREAS.some((base) => under(path, base))) return "prices";
  if (MORE_AREAS.some((base) => under(path, base))) return "more";
  return null;
}

/**
 * Task screens with their own bottom action bar: the new-quote flow and the
 * job page. On a phone the tab bar hides there (the approved /ui-kit
 * examples); they have a way back in their top bar. Add a route here when a
 * redesigned screen puts a BottomActionBar on the bottom edge.
 */
export const FOCUSED_ROUTES: readonly string[] = [NEW_QUOTE_PATH, "/app/quotes/preview"];

export function isFocusedRoute(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  return FOCUSED_ROUTES.some((base) => under(path, base));
}

// ── Top bar for pages not yet redesigned ─────────────────────────────────────

export interface LegacyTopBarModel {
  title: string;
  subtitle?: string;
  back?: { href: string; label: string };
}

const TO_HOME = { href: HOME_PATH, label: "Home" };
const TO_JOBS = { href: JOBS_PATH, label: "Jobs" };
const TO_PRICES = { href: PRICES_PATH, label: "Prices" };
const TO_MORE = { href: MORE_PATH, label: "More" };

/** Titles in plain words, by path; the page's own label fills the gaps. */
const TITLES: ReadonlyArray<[base: string, title: string]> = [
  ["/app/requests", "Client requests"],
  ["/app/materials/quick-start", "Quick start"],
  ["/app/materials/kits", "Kits"],
  ["/app/materials/capture", "Add from a photo"],
  ["/app/materials/import-quote", "Prices from a quote"],
  [PRICES_PATH, "Prices"],
  ["/app/suppliers", "Suppliers"],
  ["/app/settings/guide", "How to use T2Q"],
  ["/app/settings", "Settings"],
  ["/app/clients", "Clients"],
  ["/app/team", "Your team"],
  ["/app/templates", "Terms templates"],
  ["/app/beta", "Send feedback"],
  ["/app/upgrade", "Plans"],
  ["/app/weather", "Weather"],
  ["/app/agents/monitor", "Agent monitor"],
  ["/app/agents", "Agents"],
  ["/app/admin", "Ops"],
];

function cleanContext(context: string | null | undefined): string | null {
  const text = (context ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * The new-style top bar an old page gets from <AppHeader> in the new look:
 * its title, and a way back to where it is reached from. Top-level tabs
 * (Prices) have no back link; the bottom bar is the way around.
 */
export function legacyTopBar(pathname: string | null | undefined, context?: string | null): LegacyTopBarModel {
  const path = normalizePath(pathname);
  const label = cleanContext(context);

  if (under(path, NEW_QUOTE_PATH)) return { title: "New quote", back: { href: HOME_PATH, label: "Cancel" } };
  if (under(path, "/app/quotes/preview")) {
    return label ? { title: "Job", subtitle: label, back: TO_JOBS } : { title: "Job", back: TO_JOBS };
  }
  if (under(path, "/app/quotes") || under(path, "/app/invoices")) return { title: "Jobs" };

  const title = TITLES.find(([base]) => under(path, base))?.[1] ?? label ?? "Tradies2Quote";

  if (path === PRICES_PATH) return { title };
  if (under(path, PRICES_PATH) || under(path, "/app/suppliers")) return { title, back: TO_PRICES };
  if (under(path, "/app/debug")) {
    return path === "/app/debug"
      ? { title: label ?? "Debug", back: TO_MORE }
      : { title: label ?? "Debug", back: { href: "/app/debug", label: "Debug" } };
  }
  if (MORE_AREAS.some((base) => under(path, base))) return { title, back: TO_MORE };
  return { title, back: TO_HOME };
}

// ── The old lists in the new look ────────────────────────────────────────────

/** The old Quotes and Invoices lists, which Jobs replaces in the new look. */
export function isLegacyListPath(pathname: string | null | undefined): boolean {
  const path = normalizePath(pathname);
  return path === "/app/quotes" || path === "/app/invoices";
}

/**
 * Where an old list link lands in the new look, filter kept:
 *   /app/quotes?stage=sent      → /app/jobs?show=waiting
 *   /app/invoices?status=paid   → /app/jobs?show=done
 */
export function legacyListRedirect(pathname: string | null | undefined, search: string | URLSearchParams): string {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const path = normalizePath(pathname);
  if (path === "/app/invoices") return jobsHref(jobsFilterForInvoiceStatus(params.get("status")));
  // The quotes list reads ?stage=; the agents page links with ?status=.
  return jobsHref(jobsFilterForQuoteStage(params.get("stage") ?? params.get("status")));
}
