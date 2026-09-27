// The T2QCAL calculation record in both looks. The classic snapshot was taken
// from the untouched component, before the new look was added, so the
// classic editor provably renders exactly as it did.
// Regenerate only after an intended change to the old look:
// npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteLineItem } from "@/lib/quote-types";
import { applyLineEdit } from "@/lib/t2qcalLineEdit";
import { markupRuleBreaks } from "@/test/design-rules";
import { T2QCALWorking } from "./T2QCALWorking";

/** What Deck board layout sends (the 3D site's clip shows this record). */
const DECKING: QuoteLineItem = {
  type: "material",
  description: "Decking lineal length to order",
  quantity: 184.8,
  unit: "m",
  unit_price: 8,
  line_total: 1478.4,
  quantity_source: "calculator",
  t2qcal_calculator_snapshot: {
    toolSlug: "deck-boards",
    toolName: "Deck board layout",
    inputs: [
      { key: "runLength", label: "Board run length", value: 6000, unit: "mm" },
      { key: "deckWidth", label: "Deck width", value: 4000, unit: "mm" },
      { key: "boardWidth", label: "Board width", value: 140, unit: "mm" },
      { key: "board", label: "Board", value: 1, unit: "", displayLabel: "140 × 19 kwila" },
    ],
  },
  t2qcal_assumptions: ["Boards run the long way"],
  t2qcal_checks: ["Gaps suit the timber's moisture"],
};

const OLD_RECORD = { ...DECKING, t2qcal_provenance_note: "Worked out on the phone, 2 Sep" };

describe("T2QCALWorking (classic) renders exactly as before", () => {
  it("the record, a note, an edited line, and nothing for an ordinary line", async () => {
    const out = [
      renderToStaticMarkup(<T2QCALWorking line={DECKING} />),
      renderToStaticMarkup(<T2QCALWorking line={OLD_RECORD} />),
      renderToStaticMarkup(<T2QCALWorking line={applyLineEdit(DECKING, { quantity: 190 })} />),
    ].join("\n");
    expect(renderToStaticMarkup(<T2QCALWorking line={{}} />)).toBe("");
    await expect(out).toMatchFileSnapshot("./__snapshots__/T2QCALWorking.classic.html");
  });

  it("is the default look", () => {
    expect(renderToStaticMarkup(<T2QCALWorking line={OLD_RECORD} look="classic" />)).toBe(
      renderToStaticMarkup(<T2QCALWorking line={OLD_RECORD} />),
    );
  });
});

/** The words a tradie reads, in order. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/** Each element's tag and attributes other than class: the record's layout. */
const layout = (markup: string) => markup.replace(/ class="[^"]*"/g, "").replace(/>[^<]+</g, "><");

describe("T2QCALWorking in the new look", () => {
  const RECORDS: Array<[string, QuoteLineItem]> = [
    ["the record", DECKING],
    ["with a note", OLD_RECORD],
    ["an edited line", applyLineEdit(DECKING, { quantity: 190 })],
  ];

  it.each(RECORDS)("%s: follows the design rules", (_name, line) => {
    const markup = renderToStaticMarkup(<T2QCALWorking line={line} look="new" />);
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["font-mono", "uppercase", "tracking-", "text-brand", "text-white", "text-ink", "border-ink"]) {
      expect(markup).not.toContain(old);
    }
  });

  it.each(RECORDS)("%s: the same words, rows and order as the classic record (the 3D site's clip)", (_name, line) => {
    const markup = renderToStaticMarkup(<T2QCALWorking line={line} look="new" />);
    const classic = renderToStaticMarkup(<T2QCALWorking line={line} />);
    expect(words(markup)).toBe(words(classic));
    expect(layout(markup)).toBe(layout(classic));
  });

  it("keeps the label, tool name and input rows word for word", () => {
    const markup = renderToStaticMarkup(<T2QCALWorking line={DECKING} look="new" />);
    expect(markup).toMatch(/^<div data-testid="t2qcal-working-evidence"/);
    expect(markup).toContain(">T2QCAL calculation record<");
    expect(markup).toContain(">Deck board layout<");
    expect(markup).toContain('aria-label="Recorded calculator inputs"');
    const rows = [...markup.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([
      ["Board run length", "6000 mm"],
      ["Deck width", "4000 mm"],
      ["Board width", "140 mm"],
      ["Board", "140 × 19 kwila"],
    ]);
    expect(markup).toContain("tabular-nums");
  });

  it("stays private and empty for an ordinary line", () => {
    expect(renderToStaticMarkup(<T2QCALWorking line={{}} look="new" />)).toBe("");
  });
});
