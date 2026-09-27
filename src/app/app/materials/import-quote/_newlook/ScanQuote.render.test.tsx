// "Scan a supplier quote" in the new look, rendered in node. The first paint
// comes from the real screen (the real useQuoteImport); every later state is
// drawn by ScanQuoteView from a state object built the way the hook builds
// it. Each state keeps the old look's test ids, accessible names and roles,
// and follows the design rules, so outdoor mode can't turn it white-on-white.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../../actions", () => ({ createQuoteFromScan: vi.fn(), importSupplierQuoteItems: vi.fn() }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { librarySaveOutcome } from "@/lib/materials/libraryImport";
import { validateSupplierQuote } from "@/lib/materials/quoteValidation";
import type { ScanReviewRow } from "@/lib/materials/scanReview";
import { SCAN_DOC_ACCEPT } from "@/lib/imageUpload";
import { ScanGstNote } from "../_components/ScanGstNote";
import type { ScanState } from "./parts";
import { ScanQuoteView } from "./ScanQuote";
import { ScanQuoteScreen } from "./ScanQuoteScreen";

const noop = () => {};
const later = async () => {};

function line(patch: Partial<ScanReviewRow> & Pick<ScanReviewRow, "id" | "name">): ScanReviewRow {
  return {
    include: true,
    unit: "each",
    quantity: "1",
    price: "10",
    sku: null,
    sourceLineTotal: null,
    credit: false,
    lowConfidence: false,
    confidence: 1,
    rawText: null,
    ...patch,
  };
}

type Totals = Pick<ScanState, "srcSubtotal" | "srcGst" | "srcTotal" | "srcDiscount" | "srcFreight" | "srcAdjustments">;

/** What useQuoteImport works out from the lines: the same validator over the ticked, named ones. */
function derived(rows: ScanReviewRow[], totals: Totals, acknowledged: boolean) {
  const createable = rows.filter((r) => r.include && r.name.trim());
  const includable = createable.filter((r) => Number(r.price) > 0);
  const validation = validateSupplierQuote(
    {
      supplier: null,
      quote_number: null,
      currency: "NZD",
      gst_inclusive: false,
      items: createable.map((r) => ({
        name: r.name,
        unit: r.unit || "each",
        price: r.price.trim() !== "" && Number(r.price) !== 0 ? Number(r.price) : null,
        sku: r.sku,
        quantity: Number(r.quantity) > 0 ? Number(r.quantity) : null,
        pieces: null,
        source_line_total: r.sourceLineTotal,
        raw_text: null,
        confidence: 1,
      })),
      subtotal: totals.srcSubtotal,
      gst: totals.srcGst,
      total: totals.srcTotal,
      discount: totals.srcDiscount,
      freight: totals.srcFreight,
      adjustments: totals.srcAdjustments,
      notes: [],
    },
    { taxRate: 0.15 },
  );
  return {
    createable,
    includable,
    validation,
    lineCheckById: new Map(createable.map((r, i) => [r.id, validation.lines[i]] as const)),
    blocked: validation.blocking && !acknowledged,
  };
}

function state(patch: Partial<ScanState> = {}): ScanState {
  const rows = patch.rows ?? [];
  const totals: Totals = {
    srcSubtotal: patch.srcSubtotal ?? null,
    srcGst: patch.srcGst ?? null,
    srcTotal: patch.srcTotal ?? null,
    srcDiscount: patch.srcDiscount ?? null,
    srcFreight: patch.srcFreight ?? null,
    srcAdjustments: patch.srcAdjustments ?? null,
  };
  const acknowledged = patch.acknowledged ?? false;
  return {
    phase: "idle",
    setPhase: noop,
    result: null,
    setResult: noop,
    startOver: noop,
    error: "",
    onFileChosen: noop,
    pickFile: noop,
    pickLibrary: noop,
    clearPhotos: noop,
    removePhoto: noop,
    previews: [],
    pickedNames: [],
    fileName: "",
    scan: later,
    scanAbort: { current: null },
    scanProgress: null,
    uploadPercent: 0,
    failedPages: [],
    retryPage: later,
    retrying: null,
    consentOpen: false,
    onConsentGranted: noop,
    patchRow: noop,
    removeRow: noop,
    applySupplierValue: noop,
    review: {
      rows: rows.map((r) => ({ id: r.id, value: r, label: r.name, search: r.name, amount: Number(r.price) || 0, attention: false })),
      query: "",
      setQuery: noop,
      attention: false,
      setAttention: noop,
      sort: "source",
      setSort: noop,
      total: rows.length,
    },
    bulk: null,
    setBulk: noop,
    applyBulk: noop,
    history: [],
    undoRows: noop,
    supplier: "",
    setSupplier: noop,
    gstInclusive: false,
    setGstInclusive: noop,
    gstDetected: false,
    notes: [],
    extraction: null,
    scanViews: [],
    zoomOpen: false,
    setZoomOpen: noop,
    zoomIndex: 0,
    setZoomIndex: noop,
    setAcknowledged: noop,
    libraryMerges: [],
    save: later,
    createQuote: later,
    ...totals,
    ...derived(rows, totals, acknowledged),
    ...patch,
    rows,
    acknowledged,
  };
}

const view = (q: ScanState, taxLabel = "GST") =>
  renderToStaticMarkup(
    createElement(ScanQuoteView, {
      q,
      fileRef: { current: null },
      libraryRef: { current: null },
      currency: "NZD",
      taxLabel,
    }),
  );

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

/** The words a person sees, one space apart. */
const words = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const OLD_LOOK = ["t2q-", "font-mono", "uppercase", "font-display", "bg-ink", "text-ink", "text-white", "data-legacy-body", "// "];

// A 6-line quote as the reader returns it: one line matches its printed total,
// one doesn't, one was hard to read, a discount, one ticked out and one with
// no price yet. The printed subtotal and total don't add up, so both saves wait.
const LINES = [
  line({ id: "a", name: "Pine 90x45 H3.2 SG8", quantity: "12", price: "8.45", sourceLineTotal: 101.4, sku: "PN9045" }),
  line({ id: "b", name: "Joist hanger", quantity: "10", price: "2.5", sourceLineTotal: 30 }),
  line({ id: "c", name: "Nails 90mm", price: "45", lowConfidence: true, rawText: "NAILS 90MM 1 45.00" }),
  line({ id: "d", name: "Trade discount", price: "-10", credit: true, sourceLineTotal: -10 }),
  line({ id: "e", name: "Custom flashing", price: "", include: false }),
  line({ id: "f", name: "Delivery", price: "" }),
];

const REVIEW = {
  phase: "review",
  rows: LINES,
  fileName: "3 photos",
  supplier: "ITM",
  gstDetected: null,
  scanViews: ["blob:scan-1", "blob:scan-2"],
  failedPages: [{ source: 2, name: "IMG_0003.jpg", error: "couldn’t read that photo." }],
  extraction: {
    status: "needs_review",
    reasons: ["Two lines were hard to read."],
    rowFailures: [{ index: 4, reason: "no price", raw_text: "FLASHING CUSTOM" }],
    warnings: ["Photo 3 is the same file as number 1, so it was skipped."],
    attempts: 1,
  },
  notes: ["The delivery date isn’t shown."],
  srcSubtotal: 166.4,
  srcGst: null,
  srcTotal: 191.36,
  srcFreight: 25,
  libraryMerges: [{ name: "Joist hanger", count: 2 }],
} satisfies Partial<ScanState>;

describe("ScanQuoteScreen: first paint", () => {
  const html = renderToStaticMarkup(
    createElement(ScanQuoteScreen, { currency: "NZD", taxRate: 0.15, taxLabel: "GST", needsAiConsent: false }),
  );

  it("is a new-look screen: its title, a way back to Prices, nothing from the old page", () => {
    expect(html).toContain('data-testid="scan-quote-screen"');
    expect(html).toMatch(/<h1 [^>]*>Scan a supplier quote<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/app\/materials"[^>]*>(?:(?!<\/a>).)*Prices<\/a>/);
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("takes a photo with the camera, or photos and PDFs from the phone, as before", () => {
    const camera = tag(html, 'data-testid="quote-import-file"');
    expect(camera).toContain('capture="environment"');
    expect(camera).toContain('accept="image/*,.heic,.heif"');
    const library = tag(html, 'data-testid="quote-import-file-library"');
    expect(library).toContain(`accept="${SCAN_DOC_ACCEPT}"`);
    expect(library).toContain("multiple");
    expect(library).not.toContain("capture");
  });

  it("the orange button is the next step: take a photo; Scan waits for a page", () => {
    expect(html).toMatch(/data-variant="primary"[^>]*>.*Take a photo<\/span><\/button>/);
    expect(html).toContain("Choose photos or a PDF");
    expect(tag(html, 'data-testid="quote-import-scan"')).toContain("disabled");
    expect(html).toContain("Scan quote");
  });

  it("shows no consent step until the AI is actually needed", () => {
    expect(html).not.toContain('data-testid="ai-consent-modal"');
  });
});

describe("ScanQuoteView: picking the pages", () => {
  const picked = state({
    previews: ["blob:photo-1", ""],
    pickedNames: ["IMG_0001.jpg", "ITM quote.pdf"],
    fileName: "2 photos",
  });

  it("lists each photo and PDF with a 48 px way to remove it; Scan is now the orange button", () => {
    const html = view(picked);
    expect(html).toContain("2 files ready");
    expect(html).toContain('alt="Photo 1 of 2"');
    expect(html).toContain("ITM quote.pdf");
    expect(tag(html, 'aria-label="Remove photo 1"')).toContain("h-12 w-12");
    expect(tag(html, 'aria-label="Remove PDF 2"')).toContain("h-12 w-12");
    expect(html).toContain('data-testid="quote-import-clear"');
    expect(html).toContain('data-testid="quote-import-filename"');
    const scan = tag(html, 'data-testid="quote-import-scan"');
    expect(scan).toContain('data-variant="primary"');
    expect(scan).not.toContain("disabled");
    expect(html).toContain("Scan 2 files");
    expect(html).toMatch(/data-variant="secondary"[^>]*>.*Add a photo<\/span><\/button>/);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("while reading: page count on the button, upload progress read out, a way to stop, nothing else to tap", () => {
    const html = view({ ...picked, phase: "extracting", scanProgress: { index: 2, total: 3 }, uploadPercent: 45 });
    const scan = tag(html, 'data-testid="quote-import-scan"');
    expect(scan).toContain('aria-busy="true"');
    expect(html).toContain("Reading 2 of 3…");
    expect(html).toMatch(/role="status"[^>]*>Uploading 45%<\/p>/);
    expect(html).toContain("Cancel scan");
    expect(tag(html, 'aria-label="Remove photo 1"')).toContain("disabled");
    expect(tag(html, 'data-testid="quote-import-clear"')).toContain("disabled");
    expect(tag(html, 'data-testid="quote-import-library-btn"')).toContain("disabled");
    expect(markupRuleBreaks(html)).toEqual([]);
    expect(view({ ...picked, phase: "extracting", uploadPercent: 100 })).toContain("Uploaded. Reading the lines…");
  });

  it("a failed scan says why, as an alert, and the pages stay for another go", () => {
    const html = view({ ...picked, phase: "error", error: "Scan cancelled." });
    expect(tag(html, "Scan cancelled.")).toContain('data-testid="quote-import-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('data-tone="bad"');
    expect(tag(html, 'data-testid="quote-import-scan"')).not.toContain("disabled");
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("ScanQuoteView: checking the lines", () => {
  const html = view(state(REVIEW));
  const rows = html.slice(html.indexOf('data-testid="quote-import-rows"'), html.indexOf("</fieldset>"));

  it("follows the design rules, with nothing from the old look", () => {
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("has every part the old review had, under the same test ids", () => {
    for (const id of [
      "quote-import-view-scan",
      "quote-import-failed-pages",
      "quote-import-retry-2",
      "quote-import-lowconf-tally",
      "quote-import-gst",
      "quote-import-gst-unknown",
      "quote-import-rows",
      "quote-import-line-reconcile",
      "quote-import-use-supplier",
      "quote-import-credit",
      "quote-import-rawtext",
      "quote-import-reconcile",
      "quote-import-adjustments",
      "quote-import-library-merges",
      "quote-import-block",
      "quote-import-acknowledge",
      "quote-import-create",
      "quote-import-save",
    ]) {
      expect(html, id).toContain(`data-testid="${id}"`);
    }
    expect(tag(html, 'data-testid="quote-import-extraction"')).toContain('data-status="needs_review"');
  });

  it("one card per line, each with the old look's names and a real tick box", () => {
    expect(rows.match(/<li /g)).toHaveLength(6);
    for (const name of ["Include this line", "Material name", "Quantity", "Unit", "Unit price", "Remove line"]) {
      expect(rows.match(new RegExp(`aria-label="${name}"`, "g")), name).toHaveLength(6);
    }
    expect(rows.match(/type="checkbox"/g)).toHaveLength(6);
    expect(rows.match(/<input type="checkbox"[^>]*checked=""/g)).toHaveLength(5);
    expect(rows).toContain("Left out");
    expect(rows).toContain("Check this line");
    expect(rows).toContain("Code PN9045");
    expect(rows).toContain("Scanned as: NAILS 90MM 1 45.00");
  });

  it("a line with no price says so, tied to its price box", () => {
    const price = tag(rows, 'aria-describedby="line-f-price"');
    expect(price).toContain('aria-label="Unit price"');
    expect(price).toContain('aria-invalid="true"');
    expect(tag(rows, 'id="line-f-price"')).toContain("text-ui-bad");
    expect(words(rows)).toContain("Add a price above zero, or untick this line.");
  });

  it("a discount line keeps the minus key; the other prices get the number pad", () => {
    const prices = [...rows.matchAll(/<input [^>]*aria-label="Unit price"[^>]*>/g)].map(([input]) => input);
    expect(prices.filter((input) => input.includes('inputMode="decimal"'))).toHaveLength(5);
    expect(prices.filter((input) => input.includes('min="0"'))).toHaveLength(5);
  });

  it("a line that doesn't match its printed total offers the supplier's value", () => {
    expect(words(rows)).toContain("Supplier $30.00 Qty × price $25.00 Doesn’t match Use supplier value");
    expect(rows.match(/data-testid="quote-import-use-supplier"/g)).toHaveLength(1);
  });

  it("the totals check spells out each result, with the tradie's own tax label", () => {
    const totals = words(html.slice(html.indexOf('data-testid="quote-import-reconcile"')));
    expect(totals).toMatch(/Subtotal Supplier \$166\.40 · Your lines \$\d+\.\d\d Doesn’t match/);
    expect(totals).toMatch(/GST Supplier — · Your lines \$\d+\.\d\d Not on the quote/);
    expect(totals).toContain("freight $25.00");
    expect(words(view(state(REVIEW), "VAT"))).toMatch(/VAT Supplier — · Your lines/);
    expect(view(state(REVIEW), "VAT")).toContain("Prices include VAT");
  });

  it("while the numbers don't add up, both ways out wait for a fix or the tick", () => {
    expect(tag(html, 'data-testid="quote-import-create"')).toContain("disabled");
    expect(tag(html, 'data-testid="quote-import-save"')).toContain("disabled");
    expect(html).toContain("Fix the flagged numbers, or tick “I’ve checked these”, first.");
    expect(tag(html, 'data-testid="quote-import-acknowledge"')).toContain('type="checkbox"');
    expect(words(html)).toContain("I’ve checked these — go ahead anyway");
  });

  it("ticked: a quote from every named line, the priced ones to your prices", () => {
    const out = view(state({ ...REVIEW, acknowledged: true }));
    const create = tag(out, 'data-testid="quote-import-create"');
    expect(create).toContain('data-variant="primary"');
    expect(create).not.toContain("disabled");
    expect(out).toContain("Create a quote from 5 lines");
    expect(tag(out, 'data-testid="quote-import-save"')).not.toContain("disabled");
    expect(out).toContain("Add 3 to your prices");
    expect(out).not.toContain("Fix the flagged numbers");
  });

  it("search, order, the needs-checking filter and the bulk changes keep their names", () => {
    expect(tag(html, 'aria-label="Review controls"')).toContain("<section");
    expect(tag(html, "Search by name or code")).toContain('type="search"');
    expect(html).toMatch(/<label [^>]*>Search lines<\/label>/);
    expect(html).toMatch(/<label [^>]*>View order<\/label>/);
    expect(words(html)).toContain("Needs checking");
    expect(html).toMatch(
      /<p role="status"[^>]*>Showing 6 of 6 lines\. Filtering does not change which lines are included\.<\/p>/,
    );
    for (const button of ["Include displayed lines", "Exclude displayed lines", "Undo last edit"]) {
      expect(words(html)).toContain(button);
    }
  });

  it("the bulk change asks first", () => {
    const out = view(state({ ...REVIEW, bulk: { ids: ["a", "b"], include: false } }));
    expect(tag(out, 'aria-label="Confirm bulk change"')).toContain('role="group"');
    expect(words(out)).toContain("Exclude 2 displayed lines? Hidden lines stay as they are.");
    expect(words(out)).toContain("Confirm change");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("while saving or building the quote, the lines are locked and the button says what's happening", () => {
    const saving = view(state({ ...REVIEW, acknowledged: true, phase: "saving" }));
    expect(saving).toMatch(/<fieldset [^>]*disabled=""/);
    expect(tag(saving, 'data-testid="quote-import-save"')).toContain('aria-busy="true"');
    expect(saving).toContain("Saving…");
    expect(tag(saving, 'data-testid="quote-import-create"')).toContain("disabled");
    expect(tag(saving, 'data-testid="quote-import-retry-2"')).toContain("disabled");
    expect(markupRuleBreaks(saving)).toEqual([]);

    const creating = view(state({ ...REVIEW, acknowledged: true, phase: "creating" }));
    expect(tag(creating, 'data-testid="quote-import-create"')).toContain('aria-busy="true"');
    expect(creating).toContain("Building quote…");
    expect(markupRuleBreaks(creating)).toEqual([]);
  });

  it("a failed save shows as an alert by the buttons", () => {
    const out = view(state({ ...REVIEW, acknowledged: true, error: "Could not save to your library. Please try again." }));
    const actions = out.slice(out.indexOf('data-testid="scan-quote-actions"'));
    expect(actions).toContain('role="alert"');
    expect(tag(actions, "Could not save to your library.")).toContain('data-testid="quote-import-error"');
    expect(out.match(/data-testid="quote-import-error"/g)).toHaveLength(1);
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("the quote rides at the thumb, above the phone's tab bar; adding the prices waits at the end", () => {
    const bar = tag(html, 'data-testid="scan-quote-actions"');
    expect(bar).toContain("sticky");
    expect(bar).toContain("bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))]");
    expect(bar).toContain("sm:bottom-0");
    const inBar = html.slice(html.indexOf('data-testid="scan-quote-actions"'));
    expect(inBar).toContain('data-testid="quote-import-create"');
    expect(inBar).not.toContain('data-testid="quote-import-save"');
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1);
  });

  it("a page being tried again says so", () => {
    const out = view(state({ ...REVIEW, retrying: 2 }));
    expect(tag(out, 'data-testid="quote-import-retry-2"')).toContain('aria-busy="true"');
    expect(out).toContain("Reading…");
  });
});

describe("ScanQuoteView: the photo viewer and the consent step", () => {
  it("View scan opens the photos in a sheet, one at a time, with a zoom", () => {
    const html = view(state({ ...REVIEW, zoomOpen: true, zoomIndex: 1 }));
    expect(html).toContain('data-testid="quote-import-scan-zoom"');
    expect(html).toContain('alt="Scanned supplier quote, photo 2 of 2"');
    for (const label of ["Previous photo", "Next photo", "Close scan view"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain("Zoom in");
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("closed, or with no photos (a PDF), there is nothing to view", () => {
    expect(view(state(REVIEW))).not.toContain('data-testid="quote-import-scan-zoom"');
    const pdfOnly = view(state({ ...REVIEW, scanViews: [], zoomOpen: true }));
    expect(pdfOnly).not.toContain('data-testid="quote-import-scan-zoom"');
    expect(pdfOnly).not.toContain('data-testid="quote-import-view-scan"');
  });

  it("the iPhone app's consent step is the new-look sheet", () => {
    const html = view(state({ previews: ["blob:photo-1"], fileName: "IMG_0001.jpg", consentOpen: true }));
    expect(html).toContain('data-testid="ai-consent-modal"');
    expect(html).toMatch(/<dialog /);
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("ScanQuoteView: done", () => {
  const done = (counts: Parameters<typeof librarySaveOutcome>[0], merged: Array<{ name: string; count: number }> = []) =>
    view(
      state({
        phase: "done",
        result: { failedNames: [], ...counts, merged, outcome: librarySaveOutcome(counts) },
      }),
    );

  const outcomes: Array<[tone: string, counts: Parameters<typeof librarySaveOutcome>[0]]> = [
    ["ok", { inserted: 2, updated: 1, failed: 0 }],
    ["partial", { inserted: 3, updated: 0, failed: 1, failedNames: ["Bad line"] }],
    ["bad", { inserted: 0, updated: 0, failed: 2, failedNames: ["Pine 90x45", "Nails"] }],
  ];

  it.each(outcomes)("%s: the new-look done screen, following the design rules", (tone, counts) => {
    const html = done(counts, [{ name: "Joist hanger", count: 2 }]);
    expect(tag(html, 'data-testid="quote-import-done"')).toContain(`data-tone="${tone}"`);
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("ScanGstNote, new look", () => {
  it("the same note, still read out, in ui- tokens", () => {
    const html = renderToStaticMarkup(
      createElement(ScanGstNote, { look: "new", detected: null, inclusive: false, taxLabel: "VAT" }),
    );
    expect(tag(html, 'data-testid="quote-import-gst-unknown"')).toContain('role="status"');
    expect(html).toContain("include VAT");
    expect(html).not.toContain("GST");
    expect(markupRuleBreaks(html)).toEqual([]);
    expect(
      renderToStaticMarkup(createElement(ScanGstNote, { look: "new", detected: true, inclusive: true })),
    ).toBe("");
  });
});

describe("the new-look source files follow the design rules", () => {
  const files = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));

  it("covers the screen and its parts", () => {
    expect(files).toEqual(expect.arrayContaining(["ScanQuoteScreen.tsx", "ScanQuote.tsx", "ScanQuoteReview.tsx", "parts.tsx"]));
  });

  it.each(files)("%s", (name) => {
    expect(sourceRuleBreaks(readFileSync(join(__dirname, name), "utf8"))).toEqual([]);
  });
});
