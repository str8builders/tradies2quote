// "Shop supplier websites" (/app/suppliers) in the new look, rendered in
// node. The first paint comes from the real screen (the real
// useSupplierBrowser); every later state is drawn by SupplierShopView from a
// state object shaped like the hook's. Each state keeps the old look's test
// ids and follows the design rules, so outdoor mode can't turn it
// white-on-white.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The save only needs the action's reference; keep the server code out.
vi.mock("../actions", () => ({ saveSupplierMaterial: vi.fn() }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import {
  SUPPLIER_SHORTCUTS,
  SupplierBrowser,
  type Phase,
  type SupplierBrowserState,
} from "../_components/SupplierBrowser";
import { SupplierShopView } from "./SupplierShop";
import { SUPPLIERS_INTRO, SuppliersScreen } from "./SuppliersScreen";

const noop = () => {};
const later = async () => {};

function state(patch: Partial<SupplierBrowserState> = {}): SupplierBrowserState {
  return {
    inputUrl: "",
    setInputUrl: noop,
    loadedUrl: "",
    phase: { state: "idle" },
    setPhase: noop,
    detectedSupplier: null,
    pasteError: null,
    handlePasteUrl: later,
    onSubmitUrl: noop,
    onAddToMaterials: later,
    closeSheet: noop,
    onSave: later,
    ...patch,
  };
}

const view = (patch: Partial<SupplierBrowserState> = {}) =>
  renderToStaticMarkup(createElement(SupplierShopView, { b: state(patch) }));
const screen = (initialUrl: string) => renderToStaticMarkup(createElement(SuppliersScreen, { initialUrl }));

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

/** The text of one element, as it reads (inline tags add no space). */
const text = (html: string, fragment: string) => {
  const start = html.indexOf(">", html.indexOf(fragment)) + 1;
  return html.slice(start, html.indexOf("</p>", start)).replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'");
};

const OLD_LOOK = ["t2q-", "font-mono", "uppercase", "font-display", "bg-ink", "text-ink", "text-white", "data-legacy-body", "// "];

const MITRE = "https://www.mitre10.co.nz/shop/tek-screws-12g";

const REVIEW: Extract<Phase, { state: "review" }> = {
  state: "review",
  product: { name: "Tek screws 12g", price: 11.5, unit: "box" },
  sourceUrl: MITRE,
  gstInclusive: true,
  saving: false,
  saveError: null,
};
const reviewing = (patch: Partial<typeof REVIEW> = {}) =>
  view({ inputUrl: MITRE, loadedUrl: MITRE, detectedSupplier: "Mitre 10", phase: { ...REVIEW, ...patch } });

describe("SuppliersScreen: first paint", () => {
  const html = screen("");

  it("is a new-look screen: its title, a way back to Prices, nothing from the old page", () => {
    expect(html).toContain('data-testid="suppliers-screen"');
    expect(html).toMatch(/<h1 [^>]*>Shop supplier websites<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/app\/materials"[^>]*>(?:(?!<\/a>).)*Prices<\/a>/);
    expect(words(html)).toContain(SUPPLIERS_INTRO);
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("each supplier opens in the browser, under the old test ids", () => {
    expect(SUPPLIER_SHORTCUTS).toHaveLength(5);
    for (const s of SUPPLIER_SHORTCUTS) {
      const link = tag(html, `data-testid="supplier-shortcut-${s.name.toLowerCase().replace(/\s+/g, "-")}"`);
      expect(link).toContain(`href="${s.url}"`);
      expect(link).toContain('target="_blank"');
      expect(link).toContain('rel="noopener noreferrer"');
      expect(link).toContain("min-h-12");
    }
    expect(words(html)).toContain("Each one opens in your browser.");
  });

  it("the link comes back by paste or by typing it, as before", () => {
    expect(tag(html, 'data-testid="supplier-paste-clipboard"')).toContain('type="button"');
    expect(html).toContain(">Paste the link<");
    const form = html.slice(html.indexOf('data-testid="supplier-url-form"'), html.indexOf("</form>"));
    const input = tag(form, 'data-testid="supplier-url-input"');
    for (const attr of ['type="url"', 'inputMode="url"', 'autoCapitalize="off"', 'spellCheck="false"', 'value=""']) {
      expect(input).toContain(attr);
    }
    expect(tag(form, 'data-testid="supplier-url-go"')).toContain('type="submit"');
    expect(html).not.toContain('data-testid="supplier-paste-error"');
  });

  it("no link yet: says what to do next", () => {
    expect(html).toContain('data-testid="supplier-url-card"');
    expect(html).toContain('data-testid="supplier-empty"');
    expect(words(html)).toContain("No link yet Paste a product link above, then tap Add to your prices.");
    expect(html).not.toContain('data-testid="supplier-open-in-browser"');
  });

  it("the orange button is the one way on, and rides at the thumb above the phone's tab bar", () => {
    const bar = tag(html, 'data-testid="supplier-actions"');
    expect(bar).toContain("sticky");
    expect(bar).toContain("bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))]");
    expect(bar).toContain("sm:bottom-0");
    const add = tag(html, 'data-testid="supplier-add-btn"');
    expect(add).toContain('data-variant="primary"');
    expect(add).not.toContain("disabled");
    expect(html.slice(html.indexOf('data-testid="supplier-actions"'))).toContain('data-testid="supplier-add-btn"');
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1);
    expect(html).toContain(">Add to your prices<");
  });
});

describe("SuppliersScreen: arriving with a link (?url=)", () => {
  it("shows the link it will read, who sells it, and a way to open it and check", () => {
    const html = screen(MITRE);
    expect(tag(html, 'data-testid="supplier-url-input"')).toContain(`value="${MITRE}"`);
    const card = html.slice(html.indexOf('data-testid="supplier-url-card"'), html.indexOf('data-testid="supplier-actions"'));
    expect(words(card)).toContain(`Ready to read From Mitre 10 ${MITRE}`);
    const open = tag(card, 'data-testid="supplier-open-in-browser"');
    expect(open).toContain(`href="${MITRE}"`);
    expect(open).toContain('target="_blank"');
    expect(open).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('data-testid="supplier-empty"');
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("a website it doesn't know is read all the same, without a supplier name", () => {
    const html = screen("https://example.com/product/9");
    expect(words(html)).toContain("Ready to read https://example.com/product/9");
    expect(words(html)).not.toContain("From ");
  });
});

describe("SupplierShopView: reading the product", () => {
  it("a paste that didn't work says why, as an alert", () => {
    const html = view({ pasteError: "Clipboard is empty. Copy a supplier product link first, then come back." });
    const error = tag(html, 'data-testid="supplier-paste-error"');
    expect(error).toContain('role="alert"');
    expect(words(html)).toContain("Clipboard is empty.");
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("while reading: the button says so and takes no second tap", () => {
    const html = view({ inputUrl: MITRE, loadedUrl: MITRE, detectedSupplier: "Mitre 10", phase: { state: "extracting" } });
    const add = tag(html, 'data-testid="supplier-add-btn"');
    expect(add).toContain('aria-busy="true"');
    expect(add).toContain("disabled");
    expect(html).toContain("Reading the product…");
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("a read that failed shows by the button, as an alert, with a way to dismiss it", () => {
    const html = view({ phase: { state: "error", message: "Type a supplier product URL first." } });
    const bar = html.slice(html.indexOf('data-testid="supplier-actions"'));
    expect(tag(bar, 'data-testid="supplier-error-toast"')).toContain('role="alert"');
    expect(bar).toContain('data-tone="bad"');
    expect(words(bar)).toContain("Type a supplier product URL first. Dismiss Add to your prices");
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("saved: says so by the button, with a way to see your prices", () => {
    const html = view({ phase: { state: "saved", name: "Tek screws 12g" } });
    const bar = html.slice(html.indexOf('data-testid="supplier-actions"'));
    expect(tag(bar, 'data-testid="supplier-saved-toast"')).toContain('role="status"');
    expect(bar).toContain('data-tone="ok"');
    expect(words(bar)).toContain("Saved. Tek screws 12g is in your prices.");
    expect(bar).toMatch(/<a [^>]*href="\/app\/materials"[^>]*>.*See your prices<\/span><\/a>/);
    expect(bar).toContain(">Dismiss<");
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("SupplierShopView: checking what was read", () => {
  const html = reviewing();
  const sheet = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));

  it("opens a sheet with what was read, in the old sheet's boxes", () => {
    expect(sheet).toMatch(/<h2 [^>]*>Save this product\?<\/h2>/);
    expect(words(sheet)).toContain("Mitre 10");
    expect(sheet).toContain('data-testid="supplier-review-sheet"');
    expect(tag(sheet, 'data-testid="supplier-review-name"')).toContain('value="Tek screws 12g"');
    expect(tag(sheet, 'data-testid="supplier-review-unit"')).toContain('value="box"');
    const price = tag(sheet, 'data-testid="supplier-review-price"');
    for (const attr of ['type="number"', 'inputMode="decimal"', 'step="0.01"', 'min="0"', 'value="11.5"']) {
      expect(price).toContain(attr);
    }
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("the GST tick is a real, ticked checkbox, and the price saved is spelled out without GST", () => {
    const gst = tag(sheet, 'data-testid="supplier-review-gst"');
    expect(gst).toContain('type="checkbox"');
    expect(gst).toContain("checked");
    expect(text(sheet, 'data-testid="supplier-review-preview"')).toBe("We'll save $10.00 without GST ($11.50 with it).");
  });

  it("untick GST: saved as shown, rounded to the cent like the save (a half cent up)", () => {
    const out = reviewing({ gstInclusive: false, product: { ...REVIEW.product, price: 4.015 } });
    expect(tag(out, 'data-testid="supplier-review-gst"')).not.toContain("checked");
    expect(text(out, 'data-testid="supplier-review-preview"')).toBe("We'll save $4.02 as it is, with no GST taken off.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("the save is the sheet's orange button; the page's own waits behind it", () => {
    const save = tag(sheet, 'data-testid="supplier-review-save"');
    expect(save).toContain('data-variant="primary"');
    expect(save).not.toContain("disabled");
    expect(sheet).toContain(">Save to your prices<");
    expect(sheet).toContain(">Cancel<");
  });

  it("nothing to save without a name", () => {
    const out = reviewing({ product: { ...REVIEW.product, name: "" } });
    expect(tag(out, 'data-testid="supplier-review-save"')).toContain("disabled");
  });

  it("while saving the button says so; a failed save shows in the sheet, as an alert", () => {
    const saving = reviewing({ saving: true });
    const save = tag(saving, 'data-testid="supplier-review-save"');
    expect(save).toContain('aria-busy="true"');
    expect(saving).toContain("Saving…");
    expect(markupRuleBreaks(saving)).toEqual([]);

    const failed = reviewing({ saveError: "You already have a material with that name." });
    const inSheet = failed.slice(failed.indexOf("<dialog"), failed.indexOf("</dialog>"));
    expect(tag(inSheet, 'data-testid="supplier-review-error"')).toContain('role="alert"');
    expect(words(inSheet)).toContain("You already have a material with that name.");
    expect(markupRuleBreaks(failed)).toEqual([]);
  });
});

describe("SupplierShopView: a page with nothing to read", () => {
  const html = view({ inputUrl: MITRE, loadedUrl: MITRE, phase: { state: "manual", sourceUrl: MITRE } });

  it("says so in a sheet, with a way to type the price in and the link kept", () => {
    const sheet = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));
    expect(words(sheet)).toContain("Couldn't read this page");
    expect(sheet).toContain('data-testid="supplier-manual-sheet"');
    const link = tag(sheet, 'data-testid="supplier-manual-link"');
    expect(link).toContain(`href="/app/materials/capture?url=${encodeURIComponent(MITRE)}"`);
    expect(link).toContain('data-variant="primary"');
    expect(sheet).toContain(">Close<");
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("the old supplier browser is unchanged", () => {
  it("still renders the dark page with its floating Add to Materials button", () => {
    const old = renderToStaticMarkup(createElement(SupplierBrowser, { initialUrl: "" }));
    expect(old).toContain("t2q-btn-primary-pro");
    expect(old).toContain("Add to Materials");
    expect(old).toContain('data-testid="supplier-add-btn"');
    expect(old).toContain("// in-app supplier browser");
  });
});

describe("the new-look source files follow the design rules", () => {
  const files = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));

  it("covers the screen and its parts", () => {
    expect(files).toEqual(expect.arrayContaining(["SuppliersScreen.tsx", "SupplierShop.tsx"]));
  });

  it.each(files)("%s", (name) => {
    expect(sourceRuleBreaks(readFileSync(join(__dirname, name), "utf8"))).toEqual([]);
  });
});
