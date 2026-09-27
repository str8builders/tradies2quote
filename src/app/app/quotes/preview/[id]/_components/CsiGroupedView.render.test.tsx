// Trade groups in both looks. The classic snapshot was taken from the
// untouched component, before the new look was added, so the classic editor
// provably renders exactly as it did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { CsiGroupedView } from "./CsiGroupedView";

const line = (over: Partial<QuoteLineItem> & { description: string }): QuoteLineItem => ({
  type: "material",
  quantity: 1,
  unit: "ea",
  unit_price: 0,
  line_total: 0,
  ...over,
});

/** Two divisions and the review group, with every provenance and status the pills show. */
const LINES: QuoteLineItem[] = [
  line({ description: "Concrete piles (200mm)", quantity: 12, unit: "ea", quantity_source: "calculator" }),
  line({ description: "Ready-mix concrete for slab", quantity: 2.5, unit: "m3", quantity_source: "supplier", takeoff_status: "assumed" }),
  line({ description: "Decking boards (90mm)", quantity: 225.72, unit: "m", quantity_source: "ai", takeoff_status: "needs_review" }),
  line({ description: "Deck joists (2 × 6m stock)", quantity: 13, unit: "lengths", quantity_source: "user" }),
  line({ description: "Deck bearers", quantity: 0, unit: "lengths", takeoff_status: "blocked" }),
  line({ description: "Mystery widget 5000", quantity: 1, unit: "ea" }),
  line({ description: "Builder labour", type: "labour", quantity: 8, unit: "hr", quantity_source: "user" }),
];

describe("CsiGroupedView (classic) renders exactly as before", () => {
  it("divisions, the review group, and the empty state", async () => {
    const out = [
      renderToStaticMarkup(<CsiGroupedView items={LINES} />),
      renderToStaticMarkup(<CsiGroupedView items={[]} />),
    ].join("\n");
    await expect(out).toMatchFileSnapshot("./__snapshots__/CsiGroupedView.classic.html");
  });

  it("is the default look", () => {
    expect(renderToStaticMarkup(<CsiGroupedView items={LINES} look="classic" />)).toBe(
      renderToStaticMarkup(<CsiGroupedView items={LINES} />),
    );
  });
});

const testIds = (markup: string) => [...markup.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);
/** The words a tradie reads, in order. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&[^;]+;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("CsiGroupedView in the new look", () => {
  const markup = renderToStaticMarkup(<CsiGroupedView items={LINES} look="new" />);
  const classic = renderToStaticMarkup(<CsiGroupedView items={LINES} />);

  it("follows the design rules", () => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "font-display", "font-mono", "bg-ink", "text-ink", "border-ink", "text-white", "hivis", "red-"]) {
      expect(markup).not.toContain(old);
    }
  });

  it("keeps the classic groups, lines and test ids", () => {
    expect(testIds(markup)).toEqual(testIds(classic));
    for (const text of ["Division 03 — Concrete", "Division 06 — Wood &amp; Plastics", "Uncategorized / needs review", "Mystery widget 5000", "225.72"]) {
      expect(markup).toContain(text);
    }
    // The same words, save the pills now reading in sentence case.
    expect(words(markup).toLowerCase()).toBe(words(classic).toLowerCase());
  });

  it("pills are the kit's, in sentence case, coloured by what they mean", () => {
    const pill = (text: string) => markup.match(new RegExp(`data-tone="(\\w+)"[^>]*>${text}<`))?.[1];
    expect(pill("Calc")).toBe("neutral");
    expect(pill("Supplier")).toBe("neutral");
    expect(pill("Manual entry")).toBe("neutral");
    expect(pill("AI estimate")).toBe("warn");
    expect(pill("Blocked")).toBe("bad");
    expect(pill("Unconfirmed")).toBe("neutral");
    expect(pill("Needs info")).toBe("bad");
    expect(pill("Needs review")).toBe("warn");
    expect(pill("Assumed")).toBe("neutral");
  });

  it("each group opens on a 48 px row, its caret turning with its own group only", () => {
    const summaries = markup.match(/<summary[^>]*>/g) ?? [];
    expect(summaries).toHaveLength(3);
    for (const summary of summaries) expect(summary).toContain("min-h-12");
    expect(markup.match(/group-open\/csi:rotate-180/g)).toHaveLength(3);
    expect(markup).not.toMatch(/\bgroup-open:/);
  });

  it("says so when there's nothing to group", () => {
    const empty = renderToStaticMarkup(<CsiGroupedView items={[]} look="new" />);
    expect(empty).toBe('<p class="text-ui-muted">No line items to group yet.</p>');
  });
});
