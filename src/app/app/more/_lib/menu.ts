import type { IconTone } from "@/components/ui/styles";

/**
 * The More screen's rows (new look), as data. Pure.
 *
 * The four settings pages (Business details, Rates and quotes, Payments,
 * Account) are built in redesign phase 5; this screen only links to them.
 * Nothing here talks about plans or prices, so the list is the same inside
 * the iOS app (App Store 3.1.3(f)).
 */

export type MoreItemId =
  | "clients"
  | "prices"
  | "calendar"
  | "business"
  | "rates"
  | "payments"
  | "account"
  | "team"
  | "help"
  | "feedback"
  | "agents"
  | "debug"
  | "monitor"
  | "ops";

export interface MoreItem {
  id: MoreItemId;
  label: string;
  caption: string;
  href: string;
}

export interface MoreGroup {
  id: "business" | "tools" | "owner";
  title: string;
  items: MoreItem[];
}

const BUSINESS: MoreGroup = {
  id: "business",
  title: "Your business",
  items: [
    { id: "clients", label: "Clients", caption: "Saved contacts", href: "/app/clients" },
    { id: "prices", label: "Prices", caption: "Your price list", href: "/app/materials" },
    { id: "calendar", label: "Calendar", caption: "Booked jobs and day notes", href: "/app/calendar" },
    {
      id: "business",
      label: "Business details",
      caption: "Name, logo and contact details",
      href: "/app/settings/business",
    },
    {
      id: "rates",
      label: "Rates and quotes",
      caption: "Labour rate, markup and tax",
      href: "/app/settings/rates",
    },
    { id: "payments", label: "Payments", caption: "How clients pay you", href: "/app/settings/payments" },
    {
      id: "account",
      label: "Account",
      caption: "Your name, photo and notifications",
      href: "/app/settings/account",
    },
  ],
};

const TOOLS: MoreGroup = {
  id: "tools",
  title: "Tools and help",
  items: [
    { id: "team", label: "Team", caption: "People and shared clients", href: "/app/team" },
    { id: "help", label: "Help", caption: "Questions, answers and support", href: "/help" },
    { id: "feedback", label: "Send feedback", caption: "Tell us what to fix", href: "/app/beta" },
  ],
};

/** Owner-only tools; those pages check the owner again themselves. */
const OWNER: MoreGroup = {
  id: "owner",
  title: "Owner only",
  items: [
    { id: "agents", label: "Agents", caption: "The agent panel", href: "/app/agents" },
    { id: "debug", label: "Debug", caption: "Diagnostics", href: "/app/debug" },
    { id: "monitor", label: "Agent monitor", caption: "Live runs and events", href: "/app/agents/monitor" },
    { id: "ops", label: "Ops", caption: "Revenue, trials and budgets", href: "/app/admin" },
  ],
};

/** The link groups, and the owner's tools (null for everyone else). */
export function moreMenu({ isOwner }: { isOwner: boolean }): { groups: MoreGroup[]; owner: MoreGroup | null } {
  return { groups: [BUSINESS, TOOLS], owner: isOwner ? OWNER : null };
}

/**
 * Each row's tile colour (IconTone meanings: brand quotes and prices, ok
 * money in, info jobs, dates and the business, violet people, tools
 * T2QCAL, neutral help). The owner's tools stay orange.
 */
export const MORE_TONE: Readonly<Record<MoreItemId, IconTone>> = {
  clients: "violet",
  prices: "brand",
  calendar: "info",
  business: "info",
  rates: "warn",
  payments: "ok",
  account: "brand",
  team: "violet",
  help: "neutral",
  feedback: "neutral",
  agents: "brand",
  debug: "brand",
  monitor: "brand",
  ops: "brand",
};

export interface MenuSection {
  id: "you" | "work" | "help";
  title: string;
  items: MoreItem[];
}

const SECTIONS: ReadonlyArray<{ id: MenuSection["id"]; title: string; ids: readonly MoreItemId[] }> = [
  { id: "you", title: "You and your business", ids: ["account", "business", "rates", "payments"] },
  { id: "work", title: "Work", ids: ["clients", "calendar", "team"] },
  { id: "help", title: "Help", ids: ["help", "feedback"] },
];

/**
 * The menu behind your photo (top left on every tab), which replaced the
 * More tab: every More row except Prices (a tab of its own), in three
 * groups, "Account" said the way the menu means it. The same rows as the
 * More page, so the two can't drift. No plans or prices, so it's the same
 * in the iOS app.
 */
export function accountMenuSections(): MenuSection[] {
  const all = [...BUSINESS.items, ...TOOLS.items];
  return SECTIONS.map(({ id, title, ids }) => ({
    id,
    title,
    items: ids.map((itemId) => {
      const item = all.find((entry) => entry.id === itemId);
      if (!item) throw new Error(`accountMenuSections: no More item "${itemId}"`);
      return itemId === "account" ? { ...item, label: "Your profile" } : item;
    }),
  }));
}

/** The owner's tools for the photo menu (null for everyone else). */
export function ownerMenu(isOwner: boolean): MoreGroup | null {
  return isOwner ? OWNER : null;
}
