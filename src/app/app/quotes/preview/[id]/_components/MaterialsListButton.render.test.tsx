// The materials list button in both looks. The classic snapshot was taken
// from the untouched component, before the new look was added, so the
// classic editor provably renders exactly as it did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonClasses } from "@/components/ui/button";
import type { QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { MaterialsListButton } from "./MaterialsListButton";

const LABOUR: QuoteLineItem = { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };
const DECKING: QuoteLineItem = { type: "material", description: "Decking 140x32", quantity: 42, unit: "length", unit_price: 36, line_total: 1512 };

describe("MaterialsListButton (classic) renders exactly as before", () => {
  it("the chip, and nothing when there are no materials", async () => {
    expect(renderToStaticMarkup(<MaterialsListButton items={[LABOUR]} />)).toBe("");
    await expect(renderToStaticMarkup(<MaterialsListButton items={[LABOUR, DECKING]} jobSummary="Deck" />)).toMatchFileSnapshot(
      "./__snapshots__/MaterialsListButton.classic.html",
    );
  });

  it("is the default look", () => {
    expect(renderToStaticMarkup(<MaterialsListButton items={[DECKING]} look="classic" />)).toBe(
      renderToStaticMarkup(<MaterialsListButton items={[DECKING]} />),
    );
  });
});

describe("MaterialsListButton in the new look", () => {
  const markup = renderToStaticMarkup(<MaterialsListButton items={[LABOUR, DECKING]} jobSummary="Deck" look="new" />);

  it("follows the design rules", () => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "bg-ink", "text-ink", "font-mono", "uppercase"]) expect(markup).not.toContain(old);
  });

  it("is the kit's secondary button, full width, with the same words and test id", () => {
    expect(markup).toMatch(/^<button type="button" data-testid="materials-list-button"/);
    expect(markup).toContain(`class="${buttonClasses({ variant: "secondary", fullWidth: true })}"`);
    expect(markup).toContain(">Copy materials list<");
  });

  it("shows nothing when there are no materials", () => {
    expect(renderToStaticMarkup(<MaterialsListButton items={[LABOUR]} look="new" />)).toBe("");
  });
});
