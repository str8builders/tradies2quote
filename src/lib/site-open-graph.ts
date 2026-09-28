/**
 * The site-wide Open Graph card (the root layout's default). A page that sets
 * its own `openGraph` replaces the root's object entirely, so the homepage
 * spreads this and adds only its url: no other page claims "/".
 */
export const SITE_OPEN_GRAPH = {
  type: "website" as const,
  siteName: "Tradies2Quote",
  title: "Tradies2Quote — AI quotes & invoices for NZ tradies",
  description:
    "Turn site notes into a professional quote. Review your scope, rates and GST before you send. Built for NZ tradies.",
  locale: "en_NZ",
};
