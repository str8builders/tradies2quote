import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { publicQuoteForClient } from "@/lib/quote-client-view";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { PublicQuoteSummary } from "./PublicQuoteSummary";
import { mailtoHref, telHref } from "./contact-links";

const payload = (overrides: Partial<PublicQuotePayload> = {}): PublicQuotePayload => ({
  id: "q-1", status: "sent", created_at: "2026-09-20T00:00:00Z", sent_at: null, expires_at: "2026-10-20T00:00:00Z",
  accepted_at: null, accepted_name: null, accepted_quote_version: 1, version: 1, currency: "NZD",
  has_pdf: true, has_signature: false, has_logo: false,
  business_name: "Taylor Carpentry", business_email: "hello@taylor.example", business_phone: "+64 21 555 0101",
  client: { name: "Sam Taylor", address: "14 Rata St", email: null, phone: null },
  job_summary: "New kwila deck",
  line_items: [
    { type: "material", description: "Decking boards", quantity: 20, unit: "m", unit_price: 12.5, line_total: 250 },
    { type: "other", description: "Skip hire", quantity: 1, unit: "each", unit_price: 120, line_total: 120 },
    { type: "labour", description: "Deck build", quantity: 10, unit: "hour", unit_price: 85, line_total: 850 },
  ],
  materials_subtotal: 370, labour_subtotal: 850, markup_amount: 74,
  subtotal_before_tax: 1294, tax_amount: 194.1, total: 1488.1,
  tax_label: "GST", tax_rate: 15, terms: null,
  ...overrides,
});

const render = (quote: PublicQuotePayload) =>
  renderToStaticMarkup(createElement(PublicQuoteSummary, { token: "tok", quote: publicQuoteForClient(quote) }));

describe("the client's quote page", () => {
  it("has no markup row, and the rows it shows add up to the subtotal", () => {
    const html = render(payload());
    expect(html).not.toMatch(/mark\s*-?\s*up/i);
    const text = html.replace(/<[^>]*>/g, " ");
    // Materials $300 (250 + 20%), other $144, labour $850 → $1,294.00.
    expect(text).toMatch(/Materials subtotal\s+\$300\.00/);
    expect(text).toMatch(/Other subtotal\s+\$144\.00/);
    expect(text).toMatch(/Labour subtotal\s+\$850\.00/);
    expect(text).toMatch(/Subtotal \(excl\. GST\)\s+\$1,294\.00/);
    expect(text).toMatch(/Total \(incl\. GST\)\s+\$1,488\.10/);
    expect(text).not.toContain("$250.00");
    expect(text).not.toContain("$74.00");
  });

  it("shows the tradie's phone and email as tap-to-call and tap-to-email links", () => {
    const html = render(payload());
    expect(html).toMatch(/<a href="tel:\+64215550101"[^>]*data-testid="public-business-phone"[^>]*>.*\+64 21 555 0101/);
    expect(html).toMatch(/<a href="mailto:hello@taylor\.example"[^>]*data-testid="public-business-email"/);
    // 44 px to tap.
    expect(html).toMatch(/data-testid="public-business-phone" class="[^"]*min-h-11/);
  });

  it("leaves no plain-text phone number for Safari to rewrite", () => {
    const html = render(payload());
    const outsideLinks = html.replace(/<a [^>]*>.*?<\/a>/g, "");
    expect(outsideLinks).not.toContain("555 0101");
  });

  it("an unusable number or address is shown as text, not a broken link", () => {
    const html = render(payload({ business_phone: "tbc", business_email: "not an email" }));
    expect(html).not.toContain("tel:");
    expect(html).not.toContain("mailto:");
    expect(html).toContain("not an email");
  });
});

describe("the dates", () => {
  // iPhone WebKit abbreviates September "Sep", Node and Chrome "Sept": a date spelled by the engine made the
  // server's text differ from the phone's, and React reported hydration error #418 on every September quote.
  it("are spelled in code (NZ day, en-NZ words), identical on the server and in any browser", () => {
    const text = render(payload({ created_at: "2026-09-15T11:59:00Z", expires_at: "2026-10-15T11:59:00Z" })).replace(/<[^>]*>/g, " ");
    expect(text).toMatch(/Issued\s+15 Sept 2026/);
    expect(text).toMatch(/Valid until\s+16 Oct 2026/);
  });
});

describe("a quote from a plan set", () => {
  it("shows each trade under its own heading and subtotal, adding up to the materials subtotal", () => {
    const html = render(
      payload({
        line_items: [
          { type: "material", description: "90x45 SG8 Studs", quantity: 412, unit: "each", unit_price: 10, line_total: 4120, section: "Framing" },
          { type: "material", description: "10mm GIB Board", quantity: 100, unit: "sheets", unit_price: 25, line_total: 2500, section: "Linings" },
          { type: "material", description: "90x45 SG8 Plates", quantity: 60, unit: "lengths", unit_price: 30, line_total: 1800, section: "Framing" },
          { type: "material", description: "Skip bin", quantity: 1, unit: "each", unit_price: 400, line_total: 400, section: null },
          { type: "labour", description: "Frame the house", quantity: 10, unit: "day", unit_price: 600, line_total: 6000 },
        ],
        materials_subtotal: 8820, labour_subtotal: 6000, markup_amount: 882,
        subtotal_before_tax: 15702, tax_amount: 2355.3, total: 18057.3,
      }),
    );
    const text = html.replace(/<[^>]*>/g, " ");
    // 10% markup folded in: Framing $5,920 → $6,512, Linings $2,750, the skip bin $440.
    expect(text).toMatch(/Framing\s+\$6,512\.00/);
    expect(text).toMatch(/Linings\s+\$2,750\.00/);
    expect(text).toMatch(/Other materials\s+\$440\.00/);
    expect(text).toMatch(/Materials subtotal\s+\$9,702\.00/);
    const order = ["Framing", "Linings", "Other materials"].map((t) => html.indexOf(`data-section="${t}"`));
    expect(order[0]).toBeGreaterThan(-1);
    expect(order[0] < order[1] && order[1] < order[2]).toBe(true);
    expect(html).not.toContain('data-section="Other labour"');
  });

  it("a quote without sections shows the plain list", () => {
    expect(render(payload())).not.toContain("data-section=");
  });
});

describe("contact links", () => {
  it("dials the digits, keeping a leading +", () => {
    expect(telHref("021 555 0101")).toBe("tel:0215550101");
    expect(telHref("+64 (21) 555-0101")).toBe("tel:+64215550101");
    expect(telHref(" 07 578 1234 ")).toBe("tel:075781234");
    expect(telHref("tbc")).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it("emails a plausible address only", () => {
    expect(mailtoHref(" hello@taylor.example ")).toBe("mailto:hello@taylor.example");
    expect(mailtoHref("hello@taylor")).toBeNull();
    expect(mailtoHref("a b@c.d")).toBeNull();
    expect(mailtoHref(undefined)).toBeNull();
  });
});
