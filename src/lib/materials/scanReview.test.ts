import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildReviewRows, gstBasisNote } from "./scanReview";
import { createPhotoDeduper, sha256Hex } from "./scanDedupe";
import { mergeExtractions, type ScanPage } from "./mergeExtractions";
import { ScanGstNote } from "@/app/app/materials/import-quote/_components/ScanGstNote";

// Exactly the per-page JSON /api/materials/extract-quote returns: the
// printed line total arrives as `source_line_total`.
const routePage = (over: Partial<ScanPage> = {}): ScanPage => ({
  supplier: "ITM",
  quote_number: "Q-7",
  currency: "NZD",
  gst_inclusive: false,
  items: [
    { name: "90x45 H1.2", unit: "length", quantity: 19, pieces: null, price: 12.4, source_line_total: 235.6, sku: null, raw_text: "19 @ 12.40", confidence: 0.95 },
    { name: "Trade discount", unit: "each", quantity: 1, pieces: null, price: -10, source_line_total: -10, sku: null, raw_text: "less 10.00", confidence: 0.9 },
  ],
  subtotal: 225.6,
  gst: 33.84,
  total: 259.44,
  notes: [],
  ...over,
});

let n = 0;
const nextId = () => `row-${++n}`;

describe("buildReviewRows — scanned line totals reach the review screen", () => {
  it("maps each line's printed total (source_line_total) onto the row", () => {
    const rows = buildReviewRows(mergeExtractions([routePage()]).items, nextId);
    expect(rows.map((r) => r.sourceLineTotal)).toEqual([235.6, -10]);
  });

  it("keeps full price precision and ticks a discount line for the quote", () => {
    const rows = buildReviewRows(
      [
        { name: "Nails", unit: "each", quantity: 1000, price: 0.125, source_line_total: 125, sku: null, confidence: 0.9 },
        { name: "Trade discount", unit: "each", quantity: 1, price: -10, source_line_total: -10, sku: null, confidence: 0.9 },
        { name: "Custom flashing", unit: "each", quantity: 1, price: null, source_line_total: null, sku: null, confidence: 0.9 },
      ],
      nextId,
    );
    expect(rows[0]).toMatchObject({ price: "0.125", include: true, credit: false });
    expect(rows[1]).toMatchObject({ price: "-10", include: true, credit: true });
    expect(rows[2]).toMatchObject({ price: "", include: false });
  });
});

describe("GST basis note on the review screen", () => {
  it("is shown when the scan couldn't tell, and names the current assumption", () => {
    expect(gstBasisNote(null, false)).toMatch(/couldn’t tell.*treated as excluding GST/);
    expect(gstBasisNote(null, true)).toMatch(/couldn’t tell.*including GST/);
    expect(gstBasisNote(false, false)).toBeNull();
    expect(gstBasisNote(true, true)).toBeNull();
  });

  it("renders as a visible status note", () => {
    const html = renderToStaticMarkup(createElement(ScanGstNote, { detected: null, inclusive: false }));
    expect(html).toContain('data-testid="quote-import-gst-unknown"');
    expect(html).toContain("treated as excluding GST");
    expect(renderToStaticMarkup(createElement(ScanGstNote, { detected: false, inclusive: false }))).toBe("");
  });
});

describe("duplicate photo detection (prepared bytes)", () => {
  it("hashes identical bytes identically", async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])]);
    const b = new Blob([new Uint8Array([1, 2, 3])]);
    expect(await sha256Hex(a)).toBe(await sha256Hex(b));
    expect(await sha256Hex(a)).not.toBe(await sha256Hex(new Blob([new Uint8Array([1, 2, 4])])));
  });

  it("reports the earlier photo when the same photo is added again", async () => {
    const dedupe = createPhotoDeduper();
    const page1 = new Blob([new Uint8Array([9, 9, 9])]);
    const page2 = new Blob([new Uint8Array([8, 8, 8])]);
    expect(await dedupe.check(page1, 1)).toBeNull();
    expect(await dedupe.check(page2, 2)).toBeNull();
    expect(await dedupe.check(new Blob([new Uint8Array([9, 9, 9])]), 3)).toBe(1);
  });
});
