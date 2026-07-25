/**
 * Single source of truth for the legal pages (privacy, terms, support)
 * and the footer's company-identity line.
 *
 * Email aliases need to actually receive mail before App Store
 * submission — Cloudflare Email Routing or ImprovMX on the domain is
 * the easiest path.
 */

export interface LegalConfig {
  /** Trading entity — the company name on your invoices. */
  companyName: string;
  /**
   * NZ Business Number from nzbn.govt.nz. Leave `null` until the real
   * 13-digit value is confirmed — every rendering site checks this and
   * silently omits the "(NZBN …)" parenthetical when it is null, so
   * no placeholder ever reaches users. Drop the value in here when
   * the number is known and every page picks it up.
   */
  nzbn: string | null;
  /**
   * Trading region. A city + country is the minimum a privacy policy
   * should disclose so users know who they are contracting with;
   * Apple does not require a street address.
   */
  address: string;
  /** Product name shown to users. */
  productName: string;
  /** Live site — used inside legal copy ("when you visit …"). */
  siteDomain: string;
  /** Support inbox. */
  supportEmail: string;
  /** Privacy / data-rights inbox. */
  privacyEmail: string;
  /** ISO date of the most recent legal-page revision. */
  lastUpdated: string;
  /** Human-readable version of `lastUpdated`. */
  lastUpdatedDisplay: string;
}

export const LEGAL: LegalConfig = {
  // Named natural person: the service is operated by a sole trader, and a
  // privacy policy must identify its actual data controller — a bare product
  // name is not a legal entity (NZ Privacy Act 2020 / GDPR Art. 13).
  companyName: "Challis Samu (sole trader), trading as tradies2Quote",
  nzbn: null,
  address: "Tauranga, New Zealand",
  productName: "tradies2Quote",
  siteDomain: "tradies2quote.com",
  supportEmail: "support@tradies2quote.com",
  privacyEmail: "privacy@tradies2quote.com",
  lastUpdated: "2026-07-18",
  lastUpdatedDisplay: "18 July 2026",
};
