// The pre-send readiness list, rendered to static HTML in node. The classic
// look is pinned by file snapshots taken from the untouched component, before
// the new look existed, so look="classic" (the default) provably renders
// exactly as before. Regenerate only after an intended change to the classic
// look: npx vitest run <this file> --update
//
// look="new" (the new-look job page's "More tools" sheet) shows the same
// checks with the kit: same test ids and statuses, the new look's rules.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkQuoteReadiness, type ProfileForReadiness } from "@/lib/quote-readiness";
import type { QuoteData } from "@/lib/quote-types";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { QuoteReadinessCheck } from "./QuoteReadinessCheck";

const QUOTE: QuoteData = {
  client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
  job_summary: "New kwila deck at 14 Rata St",
  line_items: [
    { type: "material", description: "Kwila decking 140x19", quantity: 42, unit: "length", unit_price: 36, line_total: 1512 },
    { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 },
  ],
  materials_subtotal: 1512,
  labour_subtotal: 1680,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 3192,
  tax_amount: 478.8,
  total: 3670.8,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "50% deposit on acceptance, balance on completion.",
  notes: ["Excludes consents and council fees."],
};
const PROFILE: ProfileForReadiness = {
  business_name: "STR8 Builders",
  email: "office@example.invalid",
  phone: null,
  address: null,
};
const EXPIRES = "2026-10-27T00:00:00.000Z";

const STATES = {
  ready: { quoteData: QUOTE, profile: PROFILE, expiresAt: EXPIRES },
  review: { quoteData: { ...QUOTE, terms: "", notes: [] }, profile: PROFILE, expiresAt: null },
  missing: { quoteData: { ...QUOTE, client: { ...QUOTE.client, name: "To be confirmed" } }, profile: null, expiresAt: EXPIRES },
};

describe("classic look (the default) renders exactly as before", () => {
  it.each(Object.keys(STATES) as Array<keyof typeof STATES>)("%s", async (name) => {
    const out = renderToStaticMarkup(<QuoteReadinessCheck {...STATES[name]} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/QuoteReadinessCheck.classic.${name}.html`);
  });
});

const NAMES = Object.keys(STATES) as Array<keyof typeof STATES>;
const render = (name: keyof typeof STATES, look?: "classic" | "new") =>
  renderToStaticMarkup(<QuoteReadinessCheck {...STATES[name]} look={look} />);
/** Test ids and the statuses on them, in order. */
const hooks = (markup: string) => [...markup.matchAll(/\bdata-(?:testid|readiness-[\w-]+)="[^"]*"/g)].map((m) => m[0]);
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

describe("new look", () => {
  it('look="classic" is the default', () => {
    for (const name of NAMES) expect(render(name, "classic")).toBe(render(name));
  });

  it.each(NAMES)("%s: the classic test ids and statuses, in order", (name) => {
    expect(hooks(render(name, "new"))).toEqual(hooks(render(name)));
  });

  it("the banner is a callout in the status's tone, with the tally in words", () => {
    const ready = render("ready", "new");
    expect(ready).toMatch(/data-tone="ok"[^>]*>[\s\S]*data-testid="readiness-banner-title">Ready to send</);
    expect(words(ready)).toContain("12 of 12 done.");

    const review = render("review", "new");
    expect(review).toContain('data-tone="warn"');
    expect(words(review)).toContain("Worth a check before you send");
    expect(words(review)).toMatch(/\d+ of 12 done, \d+ to check\./);

    const missing = render("missing", "new");
    expect(missing).toContain('data-tone="bad"');
    expect(words(missing)).toContain("Some details are missing");
    expect(words(missing)).toMatch(/\d+ of 12 done(, \d+ to check)?, 2 missing\./);
  });

  it("every check says its status in words too, with what to do", () => {
    const items = checkQuoteReadiness(STATES.missing.quoteData, null, EXPIRES);
    const out = words(render("missing", "new"));
    const said = { complete: "Done", warning: "To check", missing: "Missing" } as const;
    for (const item of items) {
      expect(out).toContain(`${said[item.status]}: ${item.label}`);
      if (item.detail) expect(out).toContain(item.detail);
    }
    expect(out).toContain("This list is a reminder, not a block.");
  });

  it("follows the design rules, in the markup and the source", () => {
    for (const name of NAMES) expect(markupRuleBreaks(render(name, "new")), name).toEqual([]);
    expect(sourceRuleBreaks(readFileSync(join(__dirname, "QuoteReadinessCheckV2.tsx"), "utf8"))).toEqual([]);
  });
});
