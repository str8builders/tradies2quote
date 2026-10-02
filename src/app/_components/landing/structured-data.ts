/** Only the currently available plan is offered in search metadata. */
export const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Tradies2Quote",
  description:
    "Create an editable quote from voice, text or scanned notes. Review materials, labour and GST, then send a branded quote to your client.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android (PWA)",
  offers: [
    {
      "@type": "Offer",
      name: "Solo",
      price: "49",
      priceCurrency: "NZD",
      description: "Monthly subscription, including GST. Seven-day free trial.",
    },
  ],
} as const;

/** FAQPage rich result built from the same questions the page shows. */
export function faqPageLd(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/** The public site's address. Search data names the real site whatever the environment builds it. */
const SITE = "https://tradies2quote.com/";

/**
 * How Google shows the brand in results: WebSite gives the site name it shows
 * instead of the web address, and Organization gives the logo (square, 512 px)
 * and, once the brand has them, its profiles in `sameAs` (a Product Hunt page
 * after launch, Facebook, LinkedIn). Home page only, as Google asks.
 */
export const brandLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE}#website`,
      name: "Tradies2Quote",
      url: SITE,
      publisher: { "@id": `${SITE}#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE}#organization`,
      name: "Tradies2Quote",
      url: SITE,
      logo: `${SITE}icon-512.png`,
      email: "support@tradies2quote.com",
    },
  ],
} as const;
