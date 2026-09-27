// "Copy a supplier's price" (/app/materials/capture) in the new look,
// rendered in node. The first paint comes from the real screen (the real
// useCaptureForm); every later state is drawn by CopyPriceView from a state
// object built the way the hook builds it. Each state keeps the old look's
// test ids and field names (so createMaterial takes the same form), and
// follows the design rules, so outdoor mode can't turn it white-on-white.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form only needs the action's reference; keep the server code out.
vi.mock("../../actions", () => ({ createMaterial: vi.fn() }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { round2 } from "@/lib/quote-defaults";
import {
  CaptureForm,
  UNIT_SUGGESTIONS,
  type CaptureFormProps,
  type CaptureFormState,
} from "../_components/CaptureForm";
import { supplierFromUrl } from "../_lib/supplier-from-url";
import { CAPTURE_INTRO, CaptureScreen } from "./CaptureScreen";
import { CopyPriceView } from "./CopyPrice";

const noop = () => {};
const NOTES = "Captured manually. Confirm price with supplier.";

type Typed = Pick<
  CaptureFormState,
  "url" | "name" | "unit" | "displayPrice" | "incGst" | "supplier" | "notes" | "confirming" | "errorMessage"
>;

/** A state as useCaptureForm builds it: what was typed, and what it works out from that (15 % GST). */
function state(typed: Partial<Typed> = {}): CaptureFormState {
  const t: Typed = {
    url: "",
    name: "",
    unit: "each",
    displayPrice: "",
    incGst: true,
    supplier: "",
    notes: NOTES,
    confirming: false,
    errorMessage: null,
    ...typed,
  };
  const priceNum = Number(t.displayPrice);
  const isValidPrice = Number.isFinite(priceNum) && priceNum >= 0;
  const finalPrice = isValidPrice ? round2(t.incGst ? priceNum / 1.15 : priceNum) : null;
  const detected = supplierFromUrl(t.url);
  return {
    ...t,
    setUrl: noop,
    setName: noop,
    setUnit: noop,
    setDisplayPrice: noop,
    setIncGst: noop,
    setSupplier: noop,
    setSupplierEdited: noop,
    setNotes: noop,
    setConfirming: noop,
    priceNum,
    isValidPrice,
    finalPrice,
    canConfirm: t.name.trim().length > 0 && t.unit.trim().length > 0 && finalPrice !== null,
    supplierBadgeLabel: detected ?? "Other supplier",
    isKnownSupplier: detected !== null,
    formAction: noop,
  };
}

const view = (typed: Partial<Typed> = {}, isPasteFallback = false) =>
  renderToStaticMarkup(createElement(CopyPriceView, { c: state(typed), isPasteFallback }));
const screen = (props: CaptureFormProps) => renderToStaticMarkup(createElement(CaptureScreen, props));

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

/** The text of one paragraph, as it reads (inline tags add no space). */
const text = (html: string, fragment: string) => {
  const start = html.indexOf(">", html.indexOf(fragment)) + 1;
  return html.slice(start, html.indexOf("</p>", start)).replace(/<[^>]*>/g, "").replace(/&#x27;/g, "'");
};

/** The markup from the element that holds a fragment onwards. */
const from = (markup: string, fragment: string) => markup.slice(markup.lastIndexOf("<", markup.indexOf(fragment)));

/** The opening tag of the first <input> or <textarea> with this name. */
const field = (html: string, name: string) => html.match(new RegExp(`<(?:input|textarea)[^>]*name="${name}"[^>]*>`))?.[0] ?? "";

const OLD_LOOK = ["t2q-", "font-mono", "uppercase", "font-display", "bg-ink", "text-ink", "text-white", "data-legacy-body", "// "];

const BUNNINGS = "https://www.bunnings.co.nz/tek-screws-12g_p0123";

describe("CaptureScreen: first paint, nothing shared (the paste route)", () => {
  const html = screen({ initialUrl: "", initialName: "", initialSupplier: "", isPasteFallback: true, taxRate: 0.15 });

  it("is a new-look screen: its title, a way back to Prices, nothing from the old page", () => {
    expect(html).toContain('data-testid="capture-screen"');
    expect(html).toMatch(/<h1 [^>]*>Copy a supplier&#x27;s price<\/h1>/);
    expect(html).toMatch(/<a [^>]*href="\/app\/materials"[^>]*>(?:(?!<\/a>).)*Prices<\/a>/);
    expect(words(html)).toContain(CAPTURE_INTRO);
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("says how to bring the link in", () => {
    expect(html).toContain('data-testid="capture-paste-hint"');
    expect(words(html)).toContain("Paste the product link Copy the link on the supplier's product page");
  });

  it("keeps the old form's boxes and test ids", () => {
    const url = tag(html, 'data-testid="capture-url"');
    for (const attr of ['type="url"', 'value=""', 'autoComplete="off"']) expect(url).toContain(attr);
    expect(tag(html, 'data-testid="capture-supplier"')).toContain('value=""');
    expect(tag(html, 'data-testid="capture-name"')).toContain("required");
    const unit = tag(html, 'data-testid="capture-unit"');
    for (const attr of ['value="each"', 'list="capture-unit-suggestions"', "required"]) expect(unit).toContain(attr);
    expect(html.match(/<datalist id="capture-unit-suggestions">(.*?)<\/datalist>/)?.[1].match(/<option/g)).toHaveLength(
      UNIT_SUGGESTIONS.length,
    );
    const price = tag(html, 'data-testid="capture-price"');
    for (const attr of ['type="number"', 'inputMode="decimal"', 'step="0.01"', 'min="0"', "required", 'value=""']) {
      expect(price).toContain(attr);
    }
    const gst = tag(html, 'data-testid="capture-inc-gst"');
    expect(gst).toContain('type="checkbox"');
    expect(gst).toContain("checked");
    expect(html).toContain(`${NOTES}</textarea>`);
    for (const id of ["capture-section-supplier", "capture-section-price", "capture-section-review"]) {
      expect(html).toContain(`data-testid="${id}"`);
    }
  });

  it("no link, no supplier badge; no price, nothing to spell out yet", () => {
    expect(html).not.toContain('data-testid="capture-supplier-badge"');
    expect(html).not.toContain('data-testid="capture-price-preview"');
    expect(html).not.toContain('data-testid="capture-error"');
  });

  it("Check and save is the one orange button, and waits for a name; Cancel goes back to Prices", () => {
    const review = tag(html, 'data-testid="capture-review"');
    expect(review).toContain('data-variant="primary"');
    expect(review).toContain("disabled");
    expect(html.match(/data-variant="primary"/g)).toHaveLength(1);
    expect(tag(html, 'data-testid="capture-cancel"')).toContain('href="/app/materials"');
    expect(html).not.toContain("<dialog");
  });
});

describe("CaptureScreen: a product shared to the app", () => {
  const html = screen({
    initialUrl: BUNNINGS,
    initialName: "Tek screws 12g",
    initialSupplier: "Bunnings",
    isPasteFallback: false,
    taxRate: 0.15,
  });

  it("arrives filled in, the supplier read off the link", () => {
    expect(html).not.toContain('data-testid="capture-paste-hint"');
    expect(tag(html, 'data-testid="capture-url"')).toContain(`value="${BUNNINGS}"`);
    expect(tag(html, 'data-testid="capture-supplier"')).toContain('value="Bunnings"');
    expect(tag(html, 'data-testid="capture-name"')).toContain('value="Tek screws 12g"');
    const badge = from(html, 'data-testid="capture-supplier-badge"');
    expect(tag(badge, "data-tone=")).toContain('data-tone="info"');
    expect(words(badge)).toMatch(/^Bunnings/);
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("CopyPriceView: the price", () => {
  it("a link from a website it doesn't know is from Other supplier", () => {
    const html = view({ url: "https://example.com/p/9" });
    const badge = from(html, 'data-testid="capture-supplier-badge"');
    expect(tag(badge, "data-tone=")).toContain('data-tone="neutral"');
    expect(words(badge)).toMatch(/^Other supplier/);
  });

  it("with GST ticked, spells out the price saved without it", () => {
    const html = view({ name: "Tek screws 12g", displayPrice: "11.50" });
    expect(text(html, 'data-testid="capture-price-preview"')).toBe("We'll save $10.00 without GST ($11.50 with it).");
    expect(tag(html, 'data-testid="capture-review"')).not.toContain("disabled");
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("unticked, the price is saved as shown", () => {
    const html = view({ name: "Tek screws 12g", displayPrice: "11.50", incGst: false });
    expect(tag(html, 'data-testid="capture-inc-gst"')).not.toContain("checked");
    expect(text(html, 'data-testid="capture-price-preview"')).toBe("We'll save $11.50 as it is, with no GST taken off.");
  });

  it("a failed save shows at the top of the form, as an alert", () => {
    const html = view({ name: "Tek screws 12g", displayPrice: "11.50", errorMessage: "You already have a material with that name." });
    expect(tag(html, 'data-testid="capture-error"')).toContain('role="alert"');
    expect(html.indexOf('data-testid="capture-error"')).toBeLessThan(html.indexOf('data-testid="capture-section-supplier"'));
    expect(words(html)).toContain("You already have a material with that name.");
    expect(markupRuleBreaks(html)).toEqual([]);
  });
});

describe("CopyPriceView: the check before saving", () => {
  const typed: Partial<Typed> = {
    url: BUNNINGS,
    name: "Tek screws 12g",
    unit: "box",
    displayPrice: "11.50",
    supplier: "Bunnings",
    notes: "Trade price",
    confirming: true,
  };
  const html = view(typed);
  const sheet = html.slice(html.indexOf("<dialog"), html.indexOf("</dialog>"));

  it("lists what will be saved, the price without GST first", () => {
    expect(sheet).toMatch(/<h2 [^>]*>Save this price\?<\/h2>/);
    expect(sheet).toContain('data-testid="capture-confirm-dialog"');
    expect(words(sheet)).toContain(
      `Name Tek screws 12g Unit box Price without GST $10.00 With GST $11.50 Supplier Bunnings Link ${BUNNINGS} Notes Trade price`,
    );
    for (const old of OLD_LOOK) expect(html).not.toContain(old);
    expect(markupRuleBreaks(html)).toEqual([]);
  });

  it("posts the old look's hidden fields to createMaterial, the price already without GST", () => {
    const form = sheet.slice(sheet.indexOf("<form"), sheet.indexOf("</form>"));
    expect(field(form, "name")).toContain('value="Tek screws 12g"');
    expect(field(form, "unit")).toContain('value="box"');
    expect(field(form, "default_unit_price")).toContain('value="10"');
    expect(field(form, "supplier")).toContain('value="Bunnings"');
    expect(field(form, "supplier_url")).toContain(`value="${BUNNINGS}"`);
    expect(field(form, "notes")).toContain('value="Trade price"');
    expect(field(form, "price_includes_gst")).toBe("");
    const save = tag(form, 'data-testid="capture-confirm-save"');
    expect(save).toContain('type="submit"');
    expect(save).toContain('data-variant="primary"');
    expect(form).toContain(">Add to your prices<");
    expect(tag(form, 'data-testid="capture-confirm-edit"')).toContain('type="button"');
  });

  it("unticked GST: no with-GST line, the price saved as typed", () => {
    const out = view({ ...typed, incGst: false });
    expect(words(out)).not.toContain("With GST");
    expect(field(out, "default_unit_price")).toContain('value="11.5"');
  });

  it("a failed save shows in the sheet, once, as an alert", () => {
    const out = view({ ...typed, errorMessage: "You already have a material with that name." });
    const inSheet = out.slice(out.indexOf("<dialog"), out.indexOf("</dialog>"));
    expect(tag(inSheet, 'data-testid="capture-error"')).toContain('role="alert"');
    expect(out.match(/data-testid="capture-error"/g)).toHaveLength(1);
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("the old capture form is unchanged", () => {
  it("still renders the dark form with its steps and review button", () => {
    const old = renderToStaticMarkup(
      createElement(CaptureForm, { initialUrl: "", initialName: "", initialSupplier: "", isPasteFallback: true }),
    );
    expect(old).toContain("t2q-card-pro");
    expect(old).toContain("// paste flow");
    expect(old).toContain("Review and save →");
    expect(old).toContain('data-testid="capture-review"');
  });
});

describe("the new-look source files follow the design rules", () => {
  const files = readdirSync(__dirname).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));

  it("covers the screen and its parts", () => {
    expect(files).toEqual(expect.arrayContaining(["CaptureScreen.tsx", "CopyPrice.tsx", "parts.tsx"]));
  });

  it.each(files)("%s", (name) => {
    expect(sourceRuleBreaks(readFileSync(join(__dirname, name), "utf8"))).toEqual([]);
  });
});

describe("CaptureScreen: the price is required", () => {
  it("a product with no price typed can't be saved as $0", () => {
    const html = screen({
      initialUrl: "https://www.placemakers.co.nz/online/pine-90x45",
      initialName: "Pine 90x45 H3.2",
      initialSupplier: "PlaceMakers",
      isPasteFallback: false,
      taxRate: 0.15,
    });
    expect(tag(html, 'data-testid="capture-review"')).toMatch(/\sdisabled=""/);
  });
});
