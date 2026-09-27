// The supplier check sheet: a quote made from a scanned supplier quote,
// checked against it on the job page in the new look instead of the classic
// editor's reconciliation panel. Rendered to static HTML in node, one state
// at a time, like the page's other markup contracts.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildScanQuote, type ScanQuoteLine, type ScanQuoteMeta } from "@/lib/materials/scanToQuote";
import {
  supplierMismatches,
  supplierSnapPrice,
  withSupplierPrice,
  withSupplierValues,
} from "@/lib/materials/supplierReconcile";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { updateLine, withLines } from "./lines";
import { applyPrice } from "./price-steps";
import {
  SupplierCheckSheet,
  SupplierCheckSheetView,
  supplierCheckTitle,
  type SupplierCheckSheetViewProps,
} from "./sheets/SupplierCheckSheet";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;
/** What the tradie reads: tags out, entities back, spaces tidied. */
const words = (markup: string) =>
  markup
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,])/g, "$1");

function scan(lines: ScanQuoteLine[], meta: Partial<ScanQuoteMeta> & { gstInclusive: boolean }): QuoteData {
  const built = buildScanQuote(lines, { supplier: "ITM Tauranga", ...meta }, { currency: "NZD", taxLabel: "GST", taxRate: 15 });
  if (!built.ok) throw new Error(built.error);
  return built.value.quoteData;
}

/** An ITM quote as scanned: 1,210.20 + 181.53 GST = 1,391.73. */
const itm = () =>
  scan(
    [
      { name: "Pine 90x45 H1.2 4.8m", unit: "length", quantity: 12, price: 14.35, line_total: 172.2 },
      { name: "GIB Standard 2400x1200 10mm", unit: "sheet", quantity: 20, price: 28.9, line_total: 578 },
      { name: "Nails 75mm 1kg", unit: "box", quantity: 2, price: 12.5, line_total: 25 },
      { name: "Staples 10mm", unit: "each", quantity: 10_000, price: 0.0435, line_total: 435 },
    ],
    { gstInclusive: false, subtotal: 1210.2, gst: 181.53, total: 1391.73 },
  );

/** The quote as the job page holds it after the lines change (withLines, like every save). */
const relined = (data: QuoteData, lines: readonly QuoteLineItem[]) => withLines(data, lines);
const edit = (data: QuoteData, index: number, patch: Partial<QuoteLineItem>) =>
  relined(data, data.line_items.map((l, i) => (i === index ? updateLine(l, patch) : l)));

const labour: QuoteLineItem = {
  type: "labour",
  description: "Install the lining",
  quantity: 16,
  unit: "hour",
  unit_price: 75,
  line_total: 1200,
};

const view = (data: QuoteData, patch: Partial<SupplierCheckSheetViewProps> = {}) =>
  html(
    createElement(SupplierCheckSheetView, {
      data,
      busy: null,
      error: null,
      onUseAll: noop,
      onUseLine: noop,
      onPutBack: noop,
      onClose: noop,
      ...patch,
    }),
  );
const footer = (markup: string) => markup.slice(markup.lastIndexOf('<div class="border-t border-ui-line'));

describe("supplier check: everything matches", () => {
  const data = relined(itm(), [...itm().line_items, labour]);
  const out = view(data);

  it("says who the supplier was and why it matters", () => {
    expect(words(out)).toContain("Check against the supplier's quote");
    expect(words(out)).toContain("Made from the ITM Tauranga quote you scanned. It can't be sent until the two match.");
    expect(tag(out, 'data-testid="supplier-check"')).toContain('data-fixed="true"');
    expect(words(out)).toContain("Everything matches the supplier's quote");
  });

  it("their printed subtotal and total beside this quote's lines", () => {
    const totals = words(out.slice(out.indexOf('data-testid="supplier-totals"')));
    expect(totals).toContain("Supplier's subtotal before GST $1,210.20");
    expect(totals).toContain("Their lines here, at their prices $1,210.20 Matches");
    expect(totals).toContain("Supplier's total incl. GST $1,391.73");
    // The tradie's labour is on top, and named as not checked.
    expect(totals).toContain(`This quote's total incl. GST ${"$2,771.73"}`);
    expect(words(out)).toContain("Not checked, as it isn't a line on their quote: Install the lining.");
  });

  it("lists every line of theirs with both totals, open, and nothing to fix", () => {
    expect(out).toContain("<details class=\"group\" open=\"\">");
    expect(words(out)).toContain("All 4 lines from their quote");
    expect(words(out)).toContain("Pine 90x45 H1.2 4.8m Supplier $172.20 · This quote $172.20 Matches");
    expect(words(out)).toContain("Staples 10mm Supplier $435.00 · This quote $435.00 Matches");
    expect(count(out, "Doesn&#x27;t match")).toBe(0);
    expect(out).not.toContain("supplier-use-all");
    expect(out).not.toContain("supplier-use-line");
    expect(tag(footer(out), 'data-testid="supplier-done"')).toContain('data-variant="primary"');
    expect(words(footer(out))).toContain("Done");
  });

  it("opens on the same picture", () => {
    expect(html(createElement(SupplierCheckSheet, { data, onApply: async () => ({ ok: true as const }), onClose: noop }))).toBe(out);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("supplier check: one line off", () => {
  const data = edit(itm(), 3, { unit_price: 0.05 });
  const out = view(data);

  it("marks it plainly, with the supplier's total beside this quote's", () => {
    expect(tag(out, 'data-testid="supplier-check"')).toContain('data-fixed="false"');
    expect(words(out)).toContain("1 line doesn't match");
    const row = words(out.slice(out.indexOf('data-testid="supplier-line"')));
    expect(row).toMatch(/^[^<]*Staples 10mm Doesn't match Supplier \$435\.00 This quote \$500\.00/);
    expect(tag(out, 'data-testid="supplier-line"')).toContain('data-line-index="3"');
    expect(count(out, 'data-testid="supplier-line"')).toBe(1);
  });

  it("shows the supplier's exact value, past the price box's two decimals", () => {
    expect(words(out)).toContain("The supplier's value: 10000 each × $0.0435 = $435.00.");
  });

  it("one button at the thumb uses it; the lines list stays closed", () => {
    const button = tag(out, 'data-testid="supplier-use-all"');
    expect(button.startsWith("<button")).toBe(true);
    expect(button).toContain('data-variant="primary"');
    expect(button).not.toContain("disabled");
    expect(words(footer(out))).toContain("Use the supplier's value");
    expect(words(footer(out))).not.toContain("for all");
    expect(out).not.toContain("supplier-use-line");
    expect(out).toContain('<details class="group">');
    expect(words(out)).toContain("Staples 10mm Supplier $435.00 · This quote $500.00 Doesn't match");
  });

  it("the send gate's subtotal still matches: only the line is off", () => {
    expect(words(out)).toContain("Their lines here, at their prices $1,210.20 Matches");
    expect(out).not.toContain("supplier-gap");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("supplier check: several lines off", () => {
  let data = edit(itm(), 0, { unit_price: 15.5 });
  data = edit(data, 1, { quantity: 18 });
  data = edit(data, 3, { unit_price: 0.05 });
  const out = view(data);

  it("each gets its own button, and one button fixes them all", () => {
    expect(words(out)).toContain("3 lines don't match");
    expect(count(out, 'data-testid="supplier-use-line"')).toBe(3);
    expect(words(footer(out))).toContain("Use the supplier's values for all");
  });

  it("a changed quantity is pointed out; the supplier's value keeps it and fixes the price", () => {
    expect(words(out)).toContain("Their quote had 20 sheet.");
    expect(words(out)).toContain("The supplier's value: 18 sheet × $32.11111111 = $578.00.");
    expect(words(out)).not.toContain("Their quote had 12");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a line with no quantity says what to do instead, and has no button", () => {
    const zero = view(edit(data, 2, { quantity: 0 }));
    expect(words(zero)).toContain("4 lines don't match");
    expect(words(zero)).toContain("It has no quantity, so no price can make it match. Change its quantity first.");
    expect(count(zero, 'data-testid="supplier-use-line"')).toBe(3);
    expect(markupRuleBreaks(zero)).toEqual([]);
  });
});

describe("supplier check: the subtotal is off", () => {
  it("a line on twice: says which, and to delete the extra one", () => {
    const base = itm();
    const out = view(relined(base, [...base.line_items, { ...base.line_items[2] }]));
    expect(tag(out, 'data-testid="supplier-gap"')).toContain('data-short="false"');
    expect(words(out)).toContain("Their lines here, at their prices $1,235.20 Doesn't match");
    expect(words(out)).toContain("Their lines don't add up to their subtotal");
    expect(words(out)).toContain("They come to $1,235.20 here, $25.00 more than the $1,210.20 subtotal on their quote.");
    expect(words(out)).toContain("Nails 75mm 1kg is on here twice. Delete the extra one from the job.");
    expect(out).not.toContain("supplier-unexplained");
    expect(out).not.toContain("supplier-use-all");
    expect(tag(footer(out), 'data-testid="supplier-done"')).toContain('data-variant="secondary"');
    expect(words(footer(out))).toContain("Close");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a line taken off: named from the lines as scanned in, with a button to put it back", () => {
    const base = itm();
    const data = relined(base, [base.line_items[0], base.line_items[2], base.line_items[3]]);
    const out = view(data, { imported: base.line_items });
    expect(tag(out, 'data-testid="supplier-gap"')).toContain('data-short="true"');
    expect(words(out)).toContain("They come to $632.20 here, $578.00 less than the $1,210.20 subtotal on their quote.");
    expect(words(out)).toContain("Taken off since you scanned it GIB Standard 2400x1200 10mm $578.00 20 sheet Put it back");
    expect(tag(out, 'data-testid="supplier-removed"')).toContain('data-from="1"');
    expect(tag(out, 'data-testid="supplier-put-back"')).not.toContain("disabled");
    expect(out).not.toContain("supplier-unexplained");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a line taken off, without the scanned-in lines: says a line may be missing, and why adding one by hand won't do", () => {
    const base = itm();
    const out = view(relined(base, base.line_items.slice(1)));
    expect(words(out)).toContain("A line from their quote may be missing.");
    expect(words(out)).toContain("A line you add yourself doesn't count as one of theirs, so if you can't find it, scan their quote again.");
    expect(out).not.toContain("supplier-put-back");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("rows priced by the tradie and rows the scan couldn't read are named", () => {
    const base = scan(
      [
        { name: "Decking 140x32", unit: "m", quantity: 50, price: 10, line_total: 500 },
        { name: "Deck screws", unit: "box", quantity: 1, price: 45.5, line_total: null },
      ],
      {
        gstInclusive: false,
        subtotal: 580.5,
        gst: 87.08,
        total: 667.58,
        rowFailures: [{ index: 2, reason: "price unreadable", raw_text: "Joist tape 50mm 1 @ $35.00" }],
      },
    );
    const out = view(base);
    expect(words(out)).toContain("Their quote had no total for Deck screws, so it counts at your price. If you changed it, put the price back.");
    expect(words(out)).toContain("We couldn't read this row on their quote: “Joist tape 50mm 1 @ $35.00”.");
    expect(words(out)).toContain("Deck screws No total on their quote · This quote $45.50");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("supplier check: saving, a save that failed, and a locked quote", () => {
  let two = edit(itm(), 0, { unit_price: 15.5 });
  two = edit(two, 3, { unit_price: 0.05 });

  it("saving all: the big button spins with 'Saving…' and every other fix waits", () => {
    const out = view(two, { busy: { kind: "all" } });
    const button = tag(out, 'data-testid="supplier-use-all"');
    expect(button).toContain('aria-busy="true"');
    expect(button).toContain("disabled");
    expect(words(footer(out))).toContain("Saving…");
    expect(count(out, 'data-testid="supplier-use-line"')).toBe(2);
    for (const line of out.split('data-testid="supplier-use-line"').slice(1)) {
      expect(line.slice(0, line.indexOf(">"))).toContain("disabled");
    }
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("saving one line: only its button spins", () => {
    const out = view(two, { busy: { kind: "line", index: 3 } });
    expect(count(out, 'aria-busy="true"')).toBe(1);
    const busyButton = out.slice(out.lastIndexOf("<button", out.indexOf('aria-busy="true"')));
    expect(busyButton.slice(0, busyButton.indexOf(">"))).toContain('data-testid="supplier-use-line"');
    expect(out.slice(out.indexOf('data-line-index="3"'))).toContain("Saving…");
    expect(tag(out, 'data-testid="supplier-use-all"')).toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("putting a line back: its button spins", () => {
    const base = itm();
    const out = view(relined(base, base.line_items.slice(1)), { imported: base.line_items, busy: { kind: "back", from: 0 } });
    expect(tag(out, 'data-testid="supplier-put-back"')).toContain('aria-busy="true"');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("error: says so plainly and leaves the fixes ready to try again", () => {
    const out = view(two, { error: "That didn't save. Check your signal and try again." });
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(words(out)).toContain("That didn't save. Check your signal and try again.");
    expect(tag(out, 'data-testid="supplier-use-all"')).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("locked: the comparison only, with why nothing can change", () => {
    const base = itm();
    const out = view(relined(base, [...two.line_items.slice(0, 2), ...two.line_items.slice(3)]), {
      locked: true,
      imported: base.line_items,
    });
    expect(words(out)).toContain("This quote has been accepted, so its lines can't change now.");
    expect(words(out)).toContain("Made from the ITM Tauranga quote you scanned.");
    expect(words(out)).not.toContain("It can't be sent until");
    expect(words(out)).toContain("2 lines don't match");
    expect(words(out)).toContain("Taken off since you scanned it");
    expect(out).not.toContain("supplier-use-all");
    expect(out).not.toContain("supplier-use-line");
    expect(out).not.toContain("supplier-put-back");
    expect(words(out)).not.toContain("The supplier's value");
    expect(words(out)).not.toContain("scan their quote again");
    expect(words(footer(out))).toContain("Done");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a quote not made from a supplier's quote has nothing to check", () => {
    const voice: QuoteData = { ...itm(), supplier_source: undefined, line_items: [labour] };
    const out = view(voice);
    expect(words(out)).toContain("This quote wasn't made from a supplier's quote, so there's nothing to check.");
    expect(words(out)).not.toContain("Made from");
    expect(words(footer(out))).toContain("Done");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("supplier check: the fix is the job page's own line edit", () => {
  let data = edit(itm(), 0, { unit_price: 15.5 });
  data = edit(data, 3, { unit_price: 0.05 });

  it("the supplier's value is the classic edit rule with the exact price (like the price keypad saving it)", () => {
    for (const index of [0, 3]) {
      const line = data.line_items[index];
      const price = supplierSnapPrice(line)!;
      expect(withSupplierPrice(line)).toEqual(updateLine(line, { unit_price: price }));
      expect(withSupplierValues(data.line_items, [index])).toEqual(applyPrice(data.line_items, index, price));
    }
  });

  it("after it, the job page's quote matches and the gate's supplier checks pass", () => {
    const fixed = relined(data, withSupplierValues(data.line_items));
    expect(supplierMismatches(fixed).count).toBe(0);
    const out = view(fixed);
    expect(words(out)).toContain("Everything matches the supplier's quote");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("the job page's callout title, in plain words", () => {
    expect(supplierCheckTitle(supplierMismatches(itm()))).toBeNull();
    expect(supplierCheckTitle(supplierMismatches(data))).toBe("2 lines don't match the supplier's quote");
    expect(supplierCheckTitle(supplierMismatches(edit(itm(), 0, { unit_price: 15.5 })))).toBe(
      "1 line doesn't match the supplier's quote",
    );
    const base = itm();
    expect(supplierCheckTitle(supplierMismatches(relined(base, base.line_items.slice(1))))).toBe(
      "The lines don't add up to the supplier's subtotal",
    );
  });
});
