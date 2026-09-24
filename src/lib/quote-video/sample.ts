/**
 * Made-up sample quote for the QuoteVideo composition: the Remotion Studio
 * default props, `node scripts/quote-video-worker.mjs --sample` (a server
 * smoke test that renders without touching the database) and the tests.
 * Nothing here is a real person or business.
 */
import { buildQuoteVideoProps, type QuoteVideoProps, type QuoteVideoProfileInput, type QuoteVideoQuoteInput } from "./props.ts";

export const SAMPLE_QUOTE: QuoteVideoQuoteInput = {
  quote_data: {
    client: { name: "Sam Taylor", address: "14 Rata St", email: null, phone: null },
    job_summary: "New kwila deck at 14 Rata St. Includes steps and a handrail.",
    line_items: [
      { type: "material", description: "Kwila decking and stainless fixings", quantity: 1, unit: "lot", unit_price: 1780, line_total: 1780 },
      { type: "labour", description: "Build the deck (2 builders, 2 days)", quantity: 32, unit: "hour", unit_price: 48.75, line_total: 1560 },
      { type: "material", description: "Piles, bearers and joists (H4/H3.2)", quantity: 1, unit: "lot", unit_price: 520, line_total: 520 },
      { type: "material", description: "Steps and handrail", quantity: 1, unit: "lot", unit_price: 220, line_total: 220 },
      { type: "other", description: "Site tidy and rubbish removal", quantity: 1, unit: "lot", unit_price: 120, line_total: 120 },
    ],
    subtotal_before_tax: 4200,
    tax_amount: 630,
    total: 4830,
    currency: "NZD",
    tax_label: "GST",
    tax_rate: 15,
  },
  total_amount: 4830,
  currency: "NZD",
  expires_at: "2026-10-24T02:00:00.000Z",
};

export const SAMPLE_PROFILE: QuoteVideoProfileInput = {
  business_name: "Taylor Carpentry",
  logo_url: null,
  country: "NZ",
  currency: "NZD",
};

/** A simple made-up mark (house outline on green); no text, so it needs no fonts to rasterise. */
export const SAMPLE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
<rect x="10" y="10" width="380" height="380" rx="84" fill="#1F3D2B"/>
<path d="M92 214 L200 112 L308 214" fill="none" stroke="#F4F1E8" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M128 196 V300 H272 V196" fill="none" stroke="#F4F1E8" stroke-width="26" stroke-linejoin="round"/>
<rect x="178" y="226" width="44" height="74" rx="6" fill="#FF8A3D"/>
<path d="M96 330 H304" stroke="#F2B544" stroke-width="14" stroke-linecap="round"/>
</svg>`;

/** Sample props with the sample logo inlined, as the worker would hand them to Remotion. */
export function sampleQuoteVideoProps(): QuoteVideoProps {
  const props = buildQuoteVideoProps(SAMPLE_QUOTE, SAMPLE_PROFILE);
  return {
    ...props,
    logoSrc: `data:image/svg+xml;base64,${btoa(SAMPLE_LOGO_SVG)}`,
    logoAspect: 1,
  };
}
