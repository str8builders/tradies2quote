import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS } from "@/lib/plans";
import { FAQS } from "../../landing/FAQ";
import { JobSiteStory } from "../JobSiteStory";
import { STEPS } from "../story";

const html = renderToStaticMarkup(<JobSiteStory nativeShell={false} />);
const text = html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");

describe("the job-site story is complete as plain HTML (search, screen readers, still version)", () => {
  it("has one headline and the three chapter words as headings", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text).toContain("Great at the job.");
    expect(text).toContain("Done with the paperwork.");
    for (const word of ["Talk", "Quote", "Paid", "Tools down. Quote sent."]) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${word.replace(/\./g, "\\.")}</h2>`));
    }
  });

  it("every step link has somewhere to land, and the six scenes are in order", () => {
    for (const s of STEPS) expect(html).toContain(`id="${s.anchor}"`);
    const order = ["site", "portal", "talk", "quote", "paid", "tools"].map((id) => html.indexOf(`data-scene="${id}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("shows the real plans and prices, in the app's own wording", () => {
    for (const plan of Object.values(PLANS)) {
      expect(text).toContain(plan.name);
      expect(text).toContain(`$${plan.price}`);
    }
    expect(text).toContain("NZD a month, GST inclusive");
    expect(text).toContain("7 days free, no card");
    expect(text).toContain("95 construction calculators");
  });

  it("answers every FAQ and keeps the FAQ search data", () => {
    for (const item of FAQS) expect(text).toContain(item.q);
    expect(html).toContain('"@type":"FAQPage"');
    expect(text).toContain("support@tradies2quote.com");
  });

  it("makes no claim the app can't back up", () => {
    expect(text).not.toMatch(/60 seconds|under a minute/i);
    expect(text).not.toMatch(/testimonial|trusted by \d|\d+\+? tradies use/i);
    // Invoices are marked paid by the tradie; the app doesn't collect them.
    expect(text).toContain("Mark it paid when the money lands.");
    expect(text).not.toMatch(/paid (online|in the app)|pay (the|your) invoice online/i);
  });
});

describe("inside the iOS App Store shell (3.1.3(f))", () => {
  const shell = renderToStaticMarkup(<JobSiteStory nativeShell />);
  it("no tier prices, no FAQ, no T2QCAL link, no search data", () => {
    for (const plan of Object.values(PLANS)) expect(shell).not.toContain(`$${plan.price}`);
    expect(shell).not.toContain('id="faq"');
    expect(shell).not.toContain('href="/t2qcal"');
    expect(shell).not.toContain("application/ld+json");
  });
});
