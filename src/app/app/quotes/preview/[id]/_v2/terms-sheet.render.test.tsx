// The terms sheet: the quote's terms changed on the job page, with the
// tradie's saved templates one pick away (the classic editor's terms card and
// template picker), read-only once the quote is accepted. Rendered to static
// HTML in node like the page's other markup contracts, one state at a time.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { markupRuleBreaks } from "@/test/design-rules";
import { TermsSheet, TermsSheetView, type TermsSheetViewProps } from "./sheets/TermsSheet";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const ok = async () => ({ ok: true as const });
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const TERMS = "50% deposit to book.\nBalance on completion.";
const TEMPLATES = [
  { id: "t1", title: "Standard terms" },
  { id: "t2", title: "Small jobs" },
];

const view = (patch: Partial<TermsSheetViewProps> = {}) =>
  html(
    createElement(TermsSheetView, {
      draft: TERMS,
      templates: TEMPLATES,
      replaced: null,
      locked: false,
      busy: false,
      error: null,
      onType: noop,
      onPick: noop,
      onUndo: noop,
      onSave: noop,
      onClose: noop,
      ...patch,
    }),
  );
const save = (markup: string) => tag(markup, 'data-testid="job-terms-save"');

describe("terms sheet: changing the terms", () => {
  const out = view();

  it("the terms in a big labelled box, saved with one button", () => {
    expect(out).toContain(">Terms</h2>");
    expect(out).toContain("Your client sees these under the total on the quote.");
    const box = tag(out, 'data-testid="job-terms-text"');
    expect(box.startsWith("<textarea")).toBe(true);
    expect(box).toContain('rows="8"');
    expect(box).not.toContain("disabled");
    expect(out).toContain(">50% deposit to book.\nBalance on completion.</textarea>");
    const id = /\sid="([^"]+)"/.exec(box)![1];
    expect(out).toContain(`<label for="${id}" class="mb-2 block text-ui-base font-semibold text-ui-text">Your terms</label>`);
    expect(save(out)).not.toContain("disabled");
    expect(out).toContain("Save the terms");
    expect(tag(out, 'data-testid="job-terms"')).toContain('data-locked="false"');
  });

  it("the saved templates to pick from, and what a pick does", () => {
    const pick = tag(out, 'data-testid="job-terms-template"');
    expect(pick.startsWith("<select")).toBe(true);
    expect(out).toContain("Use your saved terms");
    expect(out).toContain('<option value="" selected="">Pick saved terms…</option>');
    expect(out).toContain('<option value="t1">Standard terms</option>');
    expect(out).toContain('<option value="t2">Small jobs</option>');
    expect(out).toContain("It replaces what&#x27;s in the box below.");
    expect(out).not.toContain("Put back what was there");
  });

  it("no saved templates (or still loading): just the box", () => {
    const plain = view({ templates: [] });
    expect(plain).not.toContain("job-terms-template");
    expect(plain).toContain('data-testid="job-terms-text"');
    expect(markupRuleBreaks(plain)).toEqual([]);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("terms sheet: after a pick", () => {
  const out = view({ draft: "Payment within 7 days.", replaced: "Small jobs" });

  it("says which terms went in, and can put back what was there", () => {
    expect(out).toContain("Swapped in “Small jobs”");
    expect(out).toContain("Check the wording before you save.");
    expect(out).toContain("Put back what was there");
    expect(out).toContain(">Payment within 7 days.</textarea>");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("terms sheet: saving, and a save that failed", () => {
  it("saving: the button spins with 'Saving…' and the box and picker wait", () => {
    const out = view({ busy: true });
    expect(save(out)).toContain('aria-busy="true"');
    expect(save(out)).toContain("disabled");
    expect(out).toContain("Saving…");
    expect(tag(out, 'data-testid="job-terms-text"')).toContain("disabled");
    expect(tag(out, 'data-testid="job-terms-template"')).toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("error: says so plainly and keeps what was typed", () => {
    const out = view({ draft: "Cash on the day.", error: "That didn't save. Check your signal and try again." });
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(out).toContain("That didn&#x27;t save. Check your signal and try again.");
    expect(out).toContain(">Cash on the day.</textarea>");
    expect(save(out)).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("terms sheet: a locked quote", () => {
  it("shows the terms as words, with no box, picker or save", () => {
    const out = view({ locked: true });
    expect(tag(out, 'data-testid="job-terms"')).toContain('data-locked="true"');
    expect(out).toContain("This quote has been accepted, so its terms can&#x27;t change now.");
    expect(out).toContain("50% deposit to book.\nBalance on completion.");
    expect(out).not.toContain("<textarea");
    expect(out).not.toContain("<select");
    expect(out).not.toContain("job-terms-save");
    expect(out).toContain(">Done<");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("no terms: says so", () => {
    const out = view({ locked: true, draft: "  " });
    expect(out).toContain("There are no terms on this quote.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("TermsSheet", () => {
  it("opens on the quote's terms (the templates arrive after it opens)", () => {
    const out = html(createElement(TermsSheet, { terms: TERMS, onSave: ok, onClose: noop }));
    expect(out).toBe(view({ templates: [] }));
  });

  it("locked: the same read-only sheet", () => {
    const out = html(createElement(TermsSheet, { terms: TERMS, locked: true, onSave: ok, onClose: noop }));
    expect(out).toBe(view({ locked: true, templates: [] }));
  });
});
