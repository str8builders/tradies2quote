// "Add from a plan photo" on the job page: the classic editor's Photo / plan
// panel in the new look. Rendered to static HTML in node like the page's
// other sheets, one step at a time. Reading the photo (usePhotoPlan) is the
// classic panel's own logic, tested in _components/PhotoPlanPanel.test.ts;
// what it adds to the quote is lib/photoPlanLines, tested beside it.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { PhotoPlanResult } from "@/lib/agents/photo-plan";
import type { QuoteData } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import {
  AddFromPlanSheet,
  AddFromPlanSheetView,
  addButtonLabel,
  addFromPlanStep,
  itemDetail,
  planAddedMessage,
  type AddFromPlanSheetViewProps,
} from "./sheets/AddFromPlanSheet";

const html = (el: ReactElement) => renderToStaticMarkup(el);
/** What the tradie reads: tags and React's text separators gone, spaces squeezed. */
const words = (markup: string) =>
  markup
    .replaceAll("<!-- -->", "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;
const noop = () => {};

const PHOTO = "blob:plan-photo";

const RESULT: PhotoPlanResult = {
  description: "A hand-drawn deck plan with piles along the long side and steps at one end.",
  items: [
    {
      label: "H3.2 treated pine joists",
      location: "across the short side",
      note: "Ground-level deck",
      confidence: 0.82,
      ai_estimated: true,
    },
    { label: "Concrete piles", location: null, note: null, confidence: 0.4, ai_estimated: true },
  ],
  reviewFlags: ["No scale on the drawing, so measure the deck on site.", "  ", "Check the bearer spans."],
  quoteNote: "Supply and build a treated pine deck as drawn.\nPile positions to be confirmed on site.",
};

const view = (patch: Partial<AddFromPlanSheetViewProps> = {}) =>
  html(
    createElement(AddFromPlanSheetView, {
      step: "pick",
      previewUrl: null,
      hint: "",
      result: null,
      pickedItems: [],
      pickedNotes: [],
      error: null,
      canRetry: false,
      adding: false,
      added: false,
      addError: null,
      onPhoto: noop,
      onHint: noop,
      onRetry: noop,
      onOtherPhoto: noop,
      onPickItem: noop,
      onPickNote: noop,
      onAdd: noop,
      onConsentGranted: noop,
      onClose: noop,
      ...patch,
    }),
  );
const results = (patch: Partial<AddFromPlanSheetViewProps> = {}) =>
  view({
    step: "results",
    previewUrl: PHOTO,
    result: RESULT,
    pickedItems: [true, true],
    pickedNotes: [true, true, true],
    ...patch,
  });
const add = (markup: string) => tag(markup, 'data-testid="job-plan-photo-add"');

const QUOTE: QuoteData = {
  client: { name: "Sam Taylor", address: "14 Rata St", email: null, phone: null },
  job_summary: "New deck at 14 Rata St",
  line_items: [{ type: "labour", description: "Build the deck", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 }],
  materials_subtotal: 0,
  labour_subtotal: 1680,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 1680,
  tax_amount: 252,
  total: 1932,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: ["Client supplies the stain."],
};
const sheet = (patch: Partial<Parameters<typeof AddFromPlanSheet>[0]> = {}) =>
  html(
    createElement(AddFromPlanSheet, {
      data: QUOTE,
      onApply: async () => ({ ok: true as const }),
      onClose: noop,
      ...patch,
    }),
  );

describe("add from a plan photo: take or pick a photo", () => {
  const out = view();

  it("says what it does, with the camera first and the photo library beside it", () => {
    expect(out).toContain("Add from a plan photo");
    expect(words(out)).toContain("We list what we can see, and you pick what goes in.");
    const take = tag(out, 'data-testid="job-plan-photo-take"');
    expect(take.startsWith("<button")).toBe(true);
    expect(take).toContain('type="button"');
    expect(take).toContain('data-variant="primary"');
    expect(tag(out, 'data-testid="job-plan-photo-choose"')).toContain('data-variant="secondary"');
    expect(words(out)).toContain("Take a photo");
    expect(words(out)).toContain("Choose a photo");
  });

  it("the camera opens the back camera; both pickers take the photos the reader can read", () => {
    const camera = tag(out, 'data-testid="job-plan-photo-camera"');
    expect(camera).toContain('capture="environment"');
    expect(camera).toContain('accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"');
    const library = tag(out, 'data-testid="job-plan-photo-library"');
    expect(library).not.toContain("capture");
    expect(library).toContain('type="file"');
  });

  it("has the classic panel's optional note for the reader", () => {
    const hint = tag(out, 'data-testid="job-plan-photo-hint"');
    expect(hint).toContain('maxLength="500"');
    const id = / id="([^"]+)"/.exec(hint)![1];
    expect(out).toContain(`<label for="${id}"`);
    expect(words(out)).toContain("Anything we should look out for? (optional)");
    expect(tag(view({ hint: "north wall" }), 'data-testid="job-plan-photo-hint"')).toContain('value="north wall"');
  });

  it("nothing is being read, added or wrong yet", () => {
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain('role="status"');
    expect(out).not.toContain("job-plan-photo-add");
    expect(out).not.toContain("ai-consent-modal");
  });

  it("is where the sheet opens, even in the iPhone app before consent (asked at the first read)", () => {
    expect(sheet()).toBe(out);
    expect(sheet({ needsAiConsent: true })).toBe(out);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: reading", () => {
  const out = view({ step: "reading", previewUrl: PHOTO });

  it("shows the photo, dimmed, and a spinner that keeps turning (calmer with reduced motion)", () => {
    const photo = tag(out, `src="${PHOTO}"`);
    expect(photo).toContain('alt="Your photo"');
    expect(photo).toContain("opacity-70");
    const status = tag(out, 'role="status"');
    expect(status).toContain('data-testid="job-plan-photo-reading"');
    expect(out).toMatch(/class="[^"]*\banimate-spin\b[^"]*\bmotion-reduce:animate-spin-calm\b/);
    expect(words(out)).toContain("Reading your photo…");
    expect(words(out)).toContain("It can take up to a minute.");
  });

  it("offers nothing to tap but Close while it reads", () => {
    expect(out).not.toContain("job-plan-photo-take");
    expect(out).not.toContain("job-plan-photo-hint");
    expect(out).not.toContain("job-plan-photo-add");
    expect(count(out, "<button")).toBe(1);
    expect(tag(out, "<button")).toContain('aria-label="Close"');
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: what it found", () => {
  const out = results();
  const w = words(out);

  it("says what it sees, beside the photo", () => {
    expect(tag(out, `src="${PHOTO}"`)).not.toContain("opacity-70");
    expect(w).toContain("What we see");
    expect(w).toContain(RESULT.description);
  });

  it("lists each item with a tick, where it is, and when the reader wasn't sure", () => {
    expect(w).toContain("Items");
    expect(w).toContain("H3.2 treated pine joists");
    expect(w).toContain("Across the short side");
    expect(w).toContain("Concrete piles");
    expect(w).toContain("Not sure about this one");
    expect(count(out, 'data-testid="job-plan-photo-item"')).toBe(2);
    expect(w).toContain("Each goes in as 1, with no price unless it's in your price list. Check them before you send.");
  });

  it("lists the draft quote note and each thing to check on site, blanks left out", () => {
    expect(w).toContain("Notes");
    expect(out).toContain("Supply and build a treated pine deck as drawn.\nPile positions to be confirmed on site.");
    expect(w).toContain("Draft note for the quote");
    expect(w).toContain("No scale on the drawing, so measure the deck on site.");
    expect(w).toContain("Check the bearer spans.");
    expect(count(out, "Check on site")).toBe(2);
    expect(count(out, 'data-testid="job-plan-photo-note"')).toBe(3);
    expect(w).toContain("They go under Things to check in More tools.");
  });

  it("ticks are real tick boxes in rows big enough for a thumb, all ticked for a new read", () => {
    const first = tag(out, 'data-testid="job-plan-photo-item"');
    expect(first).toContain('type="checkbox"');
    expect(first).toContain('checked=""');
    expect(first).not.toContain('disabled=""');
    expect(count(out, 'type="checkbox"')).toBe(5);
    expect(count(out, 'checked=""')).toBe(5);
    expect(out).toContain('<label class="flex min-h-14');
    const described = /aria-describedby="([^"]+)"/.exec(first)![1];
    expect(out).toContain(`id="${described}"`);
  });

  it("one button adds what's ticked; another photo is a tap away", () => {
    expect(add(out)).not.toContain('disabled=""');
    expect(add(out)).toContain('data-variant="primary"');
    expect(w).toContain("Add 2 items and 3 notes");
    expect(w).toContain("Use a different photo");
    expect(out).not.toContain('role="alert"');
    expect(out).not.toContain("job-plan-photo-take");
  });

  it("the button follows the ticks", () => {
    const some = results({ pickedItems: [true, false], pickedNotes: [false, false, true] });
    expect(words(some)).toContain("Add 1 item and 1 note");
    expect(count(some, 'checked=""')).toBe(2);
    const none = results({ pickedItems: [false, false], pickedNotes: [false, false, false] });
    expect(words(none)).toContain("Tick what to add");
    expect(add(none)).toContain('disabled=""');
  });

  it("a read with items but no notes shows no notes list", () => {
    const itemsOnly = results({ result: { ...RESULT, quoteNote: " ", reviewFlags: [] }, pickedNotes: [] });
    expect(words(itemsOnly)).not.toContain("Notes");
    expect(words(itemsOnly)).toContain("Add 2 items");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: adding", () => {
  it("adding: the button spins with 'Adding…' and the ticks wait", () => {
    const out = results({ adding: true });
    expect(add(out)).toContain('aria-busy="true"');
    expect(add(out)).toContain('disabled=""');
    expect(words(out)).toContain("Adding…");
    expect(tag(out, 'data-testid="job-plan-photo-item"')).toContain('disabled=""');
    expect(tag(out, 'data-testid="job-plan-photo-other"')).toContain('disabled=""');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a save that failed says so plainly and keeps the ticks, ready to try again", () => {
    const out = results({ addError: "That didn't save. Check your signal and try again.", pickedItems: [true, false] });
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(words(out)).toContain("That didn't save. Check your signal and try again.");
    expect(add(out)).not.toContain('disabled=""');
    expect(words(out)).toContain("Add 1 item and 3 notes");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("once added, it can't be added twice", () => {
    const out = results({ added: true });
    expect(add(out)).toContain('disabled=""');
    expect(words(out)).toContain("Added");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: nothing found", () => {
  const out = view({
    step: "nothing",
    previewUrl: PHOTO,
    result: { description: "A blurry photo of a wall.", items: [], reviewFlags: [" "], quoteNote: "" },
  });

  it("says so, with what it did see, and offers another photo", () => {
    expect(words(out)).toContain("A blurry photo of a wall.");
    expect(words(out)).toContain("Nothing to add from this photo");
    expect(words(out)).toContain("Try a closer photo, with the plan flat and in good light.");
    expect(words(out)).toContain("Take another photo");
    expect(words(out)).toContain("Choose another photo");
    expect(out).not.toContain("job-plan-photo-add");
    expect(out).not.toContain('type="checkbox"');
  });

  it("keeps the note for the reader, to steer the next photo", () => {
    expect(out).toContain('data-testid="job-plan-photo-hint"');
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: a read that failed", () => {
  const out = view({
    step: "error",
    previewUrl: PHOTO,
    error: "Reading the photo took too long. Please try again.",
    canRetry: true,
  });

  it("says why plainly, and tries the same photo again", () => {
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(words(out)).toContain("Reading the photo took too long. Please try again.");
    const retry = tag(out, 'data-testid="job-plan-photo-retry"');
    expect(retry).toContain('type="button"');
    expect(words(out)).toContain("Try again");
    expect(tag(out, `src="${PHOTO}"`)).toContain("opacity-70");
  });

  it("or takes another photo, the note still there", () => {
    expect(words(out)).toContain("Take another photo");
    expect(out).toContain('data-testid="job-plan-photo-hint"');
  });

  it("a photo it refused before reading has nothing to try again", () => {
    const refused = view({ step: "error", error: "Unsupported image type. Use JPEG, PNG, WebP, GIF or iPhone HEIC." });
    expect(words(refused)).toContain("Unsupported image type. Use JPEG, PNG, WebP, GIF or iPhone HEIC.");
    expect(refused).not.toContain("job-plan-photo-retry");
    expect(words(refused)).toContain("Take a photo");
    expect(markupRuleBreaks(refused)).toEqual([]);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: a locked quote", () => {
  const out = view({ step: "locked" });

  it("says why nothing can be added, and offers no photo, note or add", () => {
    expect(words(out)).toContain("This quote has been accepted, so its lines can't change now.");
    expect(out).not.toContain("job-plan-photo-take");
    expect(out).not.toContain("job-plan-photo-hint");
    expect(out).not.toContain("job-plan-photo-add");
  });

  it("is what the sheet shows while the page says it's locked", () => {
    expect(sheet({ locked: true })).toBe(out);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: AI consent in the iPhone app", () => {
  const out = view({ step: "consent" });

  it("the shared consent sheet comes up in place of the reader, before the photo goes", () => {
    expect(out).toContain('data-testid="ai-consent-modal"');
    expect(words(out)).toContain("Tradies2Quote uses AI");
    expect(out).toContain('data-testid="ai-consent-accept"');
    expect(out).toContain('data-testid="ai-consent-decline"');
    expect(out).not.toContain("Add from a plan photo");
    expect(out).not.toContain("job-plan-photo");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("add from a plan photo: the steps and words", () => {
  const base = { locked: false, consent: false, reading: false, result: null, error: null };

  it("works out the step, a locked quote first", () => {
    expect(addFromPlanStep(base)).toBe("pick");
    expect(addFromPlanStep({ ...base, error: "Nope" })).toBe("error");
    expect(addFromPlanStep({ ...base, reading: true })).toBe("reading");
    expect(addFromPlanStep({ ...base, reading: true, consent: true })).toBe("consent");
    expect(addFromPlanStep({ ...base, result: RESULT })).toBe("results");
    expect(addFromPlanStep({ ...base, result: { ...RESULT, items: [] } })).toBe("results");
    expect(addFromPlanStep({ ...base, result: { ...RESULT, items: [], quoteNote: " ", reviewFlags: [""] } })).toBe("nothing");
    expect(addFromPlanStep({ ...base, locked: true, consent: true, reading: true, result: RESULT })).toBe("locked");
  });

  it("the add button counts what's ticked", () => {
    expect(addButtonLabel(2, 3)).toBe("Add 2 items and 3 notes");
    expect(addButtonLabel(1, 0)).toBe("Add 1 item");
    expect(addButtonLabel(0, 1)).toBe("Add 1 note");
    expect(addButtonLabel(0, 0)).toBe("Tick what to add");
  });

  it("the toast counts what the save added", () => {
    const before = { line_items: QUOTE.line_items, notes: QUOTE.notes };
    const after = {
      line_items: [...QUOTE.line_items, QUOTE.line_items[0], QUOTE.line_items[0]],
      notes: [...QUOTE.notes, "Check the spans."],
    };
    expect(planAddedMessage(before, after)).toBe("Added 2 items and 1 note");
    expect(planAddedMessage(before, { ...before, notes: [...QUOTE.notes, "a", "b"] })).toBe("Added 2 notes");
    expect(planAddedMessage(before, before)).toBe("Nothing added");
  });

  it("an item's detail is where it is, capitalised, and a doubt when the reader had one", () => {
    expect(itemDetail(RESULT.items[0])).toBe("Across the short side");
    expect(itemDetail(RESULT.items[1])).toBe("Not sure about this one");
    expect(itemDetail({ ...RESULT.items[0], confidence: 0.2 })).toBe("Across the short side · Not sure about this one");
    expect(itemDetail({ ...RESULT.items[0], location: "  " })).toBeUndefined();
  });
});
