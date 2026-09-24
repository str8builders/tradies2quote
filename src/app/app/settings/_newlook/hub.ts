/**
 * New-look settings: the four pages, the hub list that links to them, and
 * where the old single page's links land now. Pure, tested in node.
 */

import type { SettingsPage } from "./model";

export const SETTINGS_PATHS: Readonly<Record<SettingsPage, string>> = {
  business: "/app/settings/business",
  rates: "/app/settings/rates",
  payments: "/app/settings/payments",
  account: "/app/settings/account",
};

/** Where every new-look settings page goes back to. */
export const MORE_PATH = "/app/more";

export interface HubItem {
  page: SettingsPage;
  href: string;
  title: string;
  subtitle: string;
}

/**
 * The hub list. Inside the iOS app the Payments line never mentions the plan
 * (App Store 3.1.3(f): no billing talk in the app; the page hides it too).
 */
export function settingsHubItems({ taxLabel, native }: { taxLabel: string; native: boolean }): HubItem[] {
  return [
    {
      page: "business",
      href: SETTINGS_PATHS.business,
      title: "Business details",
      subtitle: `Name, logo, phone, email, address and ${taxLabel} number`,
    },
    {
      page: "rates",
      href: SETTINGS_PATHS.rates,
      title: "Rates and quotes",
      subtitle: `Labour rate, markup, ${taxLabel}, currency and your request link`,
    },
    {
      page: "payments",
      href: SETTINGS_PATHS.payments,
      title: "Payments",
      subtitle: native ? "How clients pay you" : "How clients pay you, and your plan",
    },
    {
      page: "account",
      href: SETTINGS_PATHS.account,
      title: "Your account",
      subtitle: "Photo, notifications, outdoor mode and sign out",
    },
  ];
}

/**
 * The old page's anchors (/app/settings#business …) are linked from the
 * account menu, the dashboard, the request poster and more. In the new look
 * the hub sends each one to the page that now holds that part.
 */
const HASH_PAGES: Readonly<Record<string, SettingsPage>> = {
  profile: "business",
  business: "business",
  business_name: "business",
  email: "business",
  phone: "business",
  address: "business",
  gst_number: "business",
  logo: "business",
  defaults: "rates",
  currency: "rates",
  country: "rates",
  tax_rate: "rates",
  default_labour_rate: "rates",
  default_markup_pct: "rates",
  "request-link": "rates",
  payment_instructions: "payments",
  payments: "payments",
  billing: "payments",
  account: "account",
};

export function settingsPathForHash(hash: string | null | undefined): string | null {
  const key = (hash ?? "").replace(/^#/, "").trim();
  if (!key) return null;
  const page = HASH_PAGES[key];
  return page ? SETTINGS_PATHS[page] : null;
}

/** With the new look off, each new page hands over to the old one at the right spot. */
export const LEGACY_SETTINGS_HREF: Readonly<Record<SettingsPage, string>> = {
  business: "/app/settings#business",
  rates: "/app/settings#defaults",
  payments: "/app/settings#payment_instructions",
  account: "/app/settings",
};

/**
 * Stripe sends people back to /app/settings?stripe=return after card-payment
 * setup. In the new look that belongs on the Payments page, which reads the
 * same flag to refresh the account status.
 */
export function newLookSettingsRedirect(searchParams: { stripe?: string | string[] } | null | undefined): string | null {
  const stripe = searchParams?.stripe;
  return stripe === "return" ? `${SETTINGS_PATHS.payments}?stripe=return` : null;
}
