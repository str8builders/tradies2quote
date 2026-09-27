// The sizes sheet: checking the sizes read off a drawing on the job page, in
// the new look, instead of the classic editor. Rendered to static HTML in
// node like the page's other markup contracts, one state at a time.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  saveQuoteChanges: vi.fn(),
  confirmDimensions: vi.fn(),
  acceptQuote: vi.fn(),
  declineQuote: vi.fn(),
  scheduleJob: vi.fn(),
  markInProgress: vi.fn(),
  markComplete: vi.fn(),
  markInvoicePaid: vi.fn(),
  createInvoiceFromQuote: vi.fn(),
}));
vi.mock("../video-actions", () => ({ requestQuoteVideoAction: vi.fn(), getQuoteVideoStatusAction: vi.fn() }));
vi.mock("@/app/app/_components/calendar-notes-actions", () => ({ addCalendarNote: vi.fn() }));

import { runTakeoff, type ParsedTakeoffResult } from "@/lib/aiTakeoffParser";
import { buildDimensionConfirmation } from "@/lib/dimensionConfirmation";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { JobScreen } from "./JobScreen";
import { withLines } from "./lines";
import { SizesSheet, SizesSheetView, type SizesSheetViewProps } from "./sheets/SizesSheet";
import type { JobScreenProps } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;

const parsed = {
  type: "deck",
  input: { deckLengthM: 4.8, deckWidthM: 3, joistSpacingMm: 450, wastePercent: 10, includePiles: true },
  missingFields: [],
  assumptions: [],
  confidence: 0.4,
} as unknown as ParsedTakeoffResult;

/** A deck quote written from a photo of a plan: calculator lines, sizes to confirm. */
function deckQuote(confirmed = false): QuoteData {
  const lines: QuoteLineItem[] = runTakeoff(parsed)!.materials.map((m) => ({
    type: "material",
    description: m.name,
    quantity: m.quantity,
    unit: m.unit,
    unit_price: 0,
    line_total: 0,
    is_missing_price: true,
    is_calculated_takeoff: true,
    quantity_source: "calculator",
    price_match_key: m.priceMatchKey,
    takeoff_status: "ok",
  }));
  lines.push({ type: "labour", description: "Build the deck", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 });
  const sizes = buildDimensionConfirmation({ isDrawing: true, parsed, noScale: true })!;
  return {
    ...withLines(
      {
        client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
        job_summary: "New deck at 14 Rata St",
        line_items: [],
        materials_subtotal: 0,
        labour_subtotal: 0,
        markup_pct: 0,
        markup_amount: 0,
        subtotal_before_tax: 0,
        tax_amount: 0,
        total: 0,
        currency: "NZD",
        tax_label: "GST",
        tax_rate: 15,
        terms: "",
        notes: [],
      },
      lines,
    ),
    takeoff_inputs: parsed.input,
    dimension_confirmation: confirmed
      ? { ...sizes, dimensions: sizes.dimensions.map((d) => ({ ...d, confirmed: true })) }
      : sizes,
  };
}

const DRAWN = { deckLengthM: "4.8", deckWidthM: "3" };

const view = (patch: Partial<SizesSheetViewProps> = {}) =>
  html(
    createElement(SizesSheetView, {
      data: deckQuote(),
      draft: DRAWN,
      tried: false,
      busy: false,
      error: null,
      onType: noop,
      onSave: noop,
      onClose: noop,
      ...patch,
    }),
  );
const save = (markup: string) => tag(markup, 'data-testid="job-sizes-save"');

describe("sizes sheet: sizes to confirm", () => {
  const out = view();

  it("lists each size read off the drawing, labelled, with its value and unit, in a box to change it", () => {
    expect(out).toContain("Check the sizes");
    expect(out).toContain("We read these off your drawing and worked out the materials from them.");
    for (const [key, label, value] of [
      ["deckLengthM", "Deck length", "4.8"],
      ["deckWidthM", "Deck width", "3"],
    ]) {
      const input = tag(out, `data-size="${key}"`);
      expect(input).toContain(`value="${value}"`);
      expect(input).toContain('inputMode="decimal"');
      expect(input).not.toContain("disabled");
      const id = /id="([^"]+)"/.exec(input)![1];
      expect(out).toContain(`<label for="${id}" class="mb-2 block text-ui-base font-semibold text-ui-text">${label}</label>`);
    }
    expect(count(out, ">m</span>")).toBe(2);
  });

  it("says why we're asking, in plain words", () => {
    expect(out).toContain("Why we&#x27;re asking");
    expect(out).toContain("We couldn&#x27;t find a scale on the drawing.");
    expect(out).toContain("The drawing was hard to read.");
    expect(out).not.toMatch(/no_scale|low_confidence/);
  });

  it("one button confirms them as read; no materials list until a size changes", () => {
    expect(save(out)).not.toContain("disabled");
    expect(out).toContain("Yes, the sizes are right");
    expect(tag(out, 'data-testid="job-sizes"')).toContain('data-edited="false"');
    expect(out).not.toContain("Materials with the new sizes");
    expect(out).not.toContain('role="alert"');
  });

  it("opens on the drawing's sizes", () => {
    expect(html(createElement(SizesSheet, { data: deckQuote(), onConfirm: async () => ({ ok: true as const }), onClose: noop }))).toBe(out);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("sizes sheet: an edited size", () => {
  const out = view({ draft: { deckLengthM: "7.2", deckWidthM: "3" } });

  it("keeps what the drawing said under the box", () => {
    expect(tag(out, 'data-size="deckLengthM"')).toContain('value="7.2"');
    expect(out).toContain("Your drawing said 4.8 m.");
    expect(out).not.toContain("Your drawing said 3 m.");
  });

  it("works the materials out again, beside the old quantities, and the button saves the new sizes", () => {
    expect(tag(out, 'data-testid="job-sizes"')).toContain('data-edited="true"');
    expect(out).toContain("Materials with the new sizes");
    expect(out).toContain("Deck joists (12 × 4.8m stock)");
    expect(out).toContain("12 lengths");
    expect(out).toContain("Was 9 lengths");
    expect(out).toContain("Was 168.96 m");
    expect(count(out, 'data-changed="true"')).toBe(6);
    expect(out).not.toContain("Build the deck");
    expect(out).toContain("Your prices stay as they are.");
    expect(out).toContain("Save the new sizes");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("sizes sheet: saving, and a save that failed", () => {
  it("saving: the button spins with 'Saving…' and the boxes wait", () => {
    const out = view({ draft: { deckLengthM: "7.2", deckWidthM: "3" }, busy: true });
    expect(save(out)).toContain('aria-busy="true"');
    expect(save(out)).toContain("disabled");
    expect(out).toContain("Saving…");
    expect(tag(out, 'data-size="deckLengthM"')).toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("error: says so plainly and keeps what was typed, ready to try again", () => {
    const out = view({ draft: { deckLengthM: "7.2", deckWidthM: "3" }, error: "That didn't save. Check your signal and try again." });
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(out).toContain("That didn&#x27;t save. Check your signal and try again.");
    expect(tag(out, 'data-size="deckLengthM"')).toContain('value="7.2"');
    expect(save(out)).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("sizes sheet: sizes it can't use", () => {
  it("a size that looks wrong gets the shared check's words as you type, and no materials", () => {
    const out = view({ draft: { deckLengthM: "2400", deckWidthM: "3" } });
    expect(out).toContain('<div aria-live="polite">');
    expect(out).toContain("That size looks wrong — Deck length 2400 m? Did you mean 2400 mm (2.4 m)?");
    expect(out).not.toContain("Materials with the new sizes");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("an empty box says so once Save is tapped", () => {
    expect(view({ draft: { deckLengthM: "", deckWidthM: "3" } })).not.toContain("Add a size bigger than 0.");
    const out = view({ draft: { deckLengthM: "", deckWidthM: "3" }, tried: true });
    expect(out).toContain("Add a size bigger than 0.");
    expect(tag(out, 'data-size="deckLengthM"')).toContain('aria-invalid="true"');
    expect(tag(out, 'data-size="deckWidthM"')).not.toContain("aria-invalid");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("job page: the sizes callout", () => {
  const props = (patch: Partial<JobScreenProps> = {}): JobScreenProps => ({
    quoteId: "5d0a1c2e-5555-4666-8777-988888888888",
    quoteNumber: "Q-2026-5D0A",
    status: "draft",
    data: deckQuote(),
    stripped: [],
    description: "type=deck",
    publicLink: null,
    hasPdf: false,
    pastExpiry: false,
    dates: {},
    bookedDate: null,
    invoice: null,
    invoiceBlockers: [],
    hasBusinessName: true,
    smsEnabled: false,
    reminder: null,
    library: [],
    video: null,
    dayNotes: [],
    serverTools: [],
    ...patch,
  });
  const screen = (patch: Partial<JobScreenProps> = {}) => html(createElement(JobScreen, props(patch)));

  it("opens the sizes sheet on the job page, not the classic editor", () => {
    const out = screen();
    expect(out).toContain("Check the sizes from your drawing");
    const button = tag(out, 'data-testid="job-check-sizes"');
    expect(button.startsWith("<button")).toBe(true);
    expect(button).toContain('type="button"');
    expect(out).not.toContain("view=classic");
  });

  it("goes once the sizes are confirmed, and while the quote is locked", () => {
    expect(screen({ data: deckQuote(true) })).not.toContain("Check the sizes from your drawing");
    expect(screen({ status: "scheduled" })).not.toContain("job-check-sizes");
  });
});
