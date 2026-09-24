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
  | "business"
  | "rates"
  | "payments"
  | "account"
  | "team"
  | "calculators"
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
      caption: "Your login, photo and notifications",
      href: "/app/settings/account",
    },
  ],
};

const TOOLS: MoreGroup = {
  id: "tools",
  title: "Tools and help",
  items: [
    { id: "team", label: "Team", caption: "People and shared clients", href: "/app/team" },
    {
      id: "calculators",
      label: "Calculators",
      caption: "Rafters, stairs, concrete and more",
      href: "/t2qcal/calculators",
    },
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
