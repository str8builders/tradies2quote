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
