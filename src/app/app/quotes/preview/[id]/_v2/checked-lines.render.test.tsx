// Lines the tradie has checked stop asking (the page agrees with the send
// gate), a guessed calculator line can be checked from its sheet, and a line
// the calculator couldn't work out says what to do on this page, not in the
// classic editor's "Takeoff assumptions" panel. Rendered to static HTML in
// node like the page's other markup contracts.
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
  markInvoiceSentByHand: vi.fn(),
}));
vi.mock("../video-actions", () => ({ requestQuoteVideoAction: vi.fn(), getQuoteVideoStatusAction: vi.fn() }));
vi.mock("@/app/app/_components/calendar-notes-actions", () => ({ addCalendarNote: vi.fn() }));

import type { DimensionConfirmation, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { JobScreen } from "./JobScreen";
import { withLines } from "./lines";
import { LineList } from "./parts/LineList";
import { LineSheet } from "./sheets/LineSheet";
import { MoreToolsSheet } from "./sheets/MoreToolsSheet";
import { blockedLineHelp, plainNote } from "./takeoff-words";
import type { JobScreenProps } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const ok = async () => ({ ok: true as const });
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const AI_CONFIRMED: QuoteLineItem = {
  type: "material",
  description: "Decking screws",
  quantity: 4,
  unit: "box",
  unit_price: 45,
  line_total: 180,
  quantity_source: "ai",
  quantity_confirmed: true,
  takeoff_status: "assumed",
};
const JOISTS: QuoteLineItem = {
  type: "material",
  description: "Joists 140x45",
  quantity: 12,
  unit: "length",
  unit_price: 38,
  line_total: 456,
  is_calculated_takeoff: true,
  quantity_source: "calculator",
  takeoff_status: "assumed",
  takeoff_flags: ["Assumed 450 mm joist centres"],
};
const BLOCKED: QuoteLineItem = {
  type: "material",
  description: "framing takeoff — needs dimensions before it can be quoted",
  quantity: 0,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  takeoff_status: "blocked",
  takeoff_flags: ["needs wall length"],
};

const sizes = (confirmed: boolean): DimensionConfirmation => ({
  required: true,
  reasons: ["low_confidence"],
  takeoff_type: "deck",
  dimensions: [
    { key: "deckLengthM", label: "Deck length", value: 4.8, unit: "m", confirmed },
    { key: "deckWidthM", label: "Deck width", value: 3.6, unit: "m", confirmed },
  ],
  confirmed_by: confirmed ? "user-1" : null,
  confirmed_at: confirmed ? "2026-09-28T01:00:00.000Z" : null,
});

const quote = (lines: QuoteLineItem[], patch: Partial<QuoteData> = {}): QuoteData =>
  withLines(
    {
      client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
      job_summary: "New deck",
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
      ...patch,
    },
    lines,
  );

function props(data: QuoteData): JobScreenProps {
  return {
    quoteId: "5d0a1c2e-5555-4666-8777-988888888888",
    quoteNumber: "Q-2026-5D0A",
    status: "draft",
    data,
    stripped: [],
    description: null,
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
  };
}

describe("checked lines stop asking", () => {
  it("a confirmed AI estimate and a calculator line under confirmed sizes need no check", () => {
    const out = html(createElement(JobScreen, props(quote([AI_CONFIRMED, JOISTS], { dimension_confirmation: sizes(true) }))));
    expect(out).not.toMatch(/lines? needs? a check/);
    expect(out).not.toContain("Check this");
    expect(out).not.toContain("Check the sizes from your drawing");
  });

  it("the same calculator line with sizes still to check is marked", () => {
    const out = html(createElement(JobScreen, props(quote([AI_CONFIRMED, JOISTS], { dimension_confirmation: sizes(false) }))));
    expect(out).toContain("1 line needs a check");
    expect(out).toContain("Check this");
  });

  it("the line list takes the sizes into account", () => {
    const marked = html(<LineList lines={[JOISTS]} currency="NZD" />);
    expect(marked).toContain("Check this");
    const answered = html(<LineList lines={[JOISTS]} currency="NZD" sizesConfirmed />);
    expect(answered).not.toContain("Check this");
    expect(markupRuleBreaks(answered)).toEqual([]);
  });
});

describe("the line sheet", () => {
  const sheet = (line: QuoteLineItem, extra: Partial<Parameters<typeof LineSheet>[0]> = {}) =>
    html(
      <LineSheet mode={{ kind: "edit", index: 0, line }} currency="NZD" onSave={ok} onClose={noop} {...extra} />,
    );

  it("a guessed calculator line offers 'The quantity is right', unticked, with the guesses", () => {
    const out = sheet(JOISTS);
    expect(words(out)).toContain("The quantity is right");
    expect(words(out)).toContain("It was worked out with some guesses. Check it before the quote goes.");
    expect(words(out)).toContain("Assumed 450 mm joist centres");
    expect(out).toMatch(/role="switch"[^>]*aria-checked="false"/);
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("once checked (or answered by confirmed sizes) it asks nothing", () => {
    for (const out of [sheet({ ...JOISTS, quantity_confirmed: true }), sheet(JOISTS, { sizesConfirmed: true })]) {
      expect(words(out)).not.toContain("The quantity is right");
      expect(words(out)).not.toContain("worked out with some guesses");
    }
  });

  it("a blocked line says what to do here, never the classic panel's words", () => {
    const out = sheet(BLOCKED);
    expect(words(out)).toContain("This line needs a size");
    expect(words(out)).toContain("Framing needs the wall length and height before it can be worked out.");
    expect(words(out)).toContain("Type how many below to make it your own number, or delete the line.");
    expect(out).not.toMatch(/Takeoff assumptions|Recalculate/i);
    expect(out).not.toContain('data-testid="job-line-measurements"');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("on a wall job it points to the measurements sheet", () => {
    const onMeasurements = vi.fn();
    const out = sheet(BLOCKED, { onMeasurements });
    expect(out).toContain('data-testid="job-line-measurements"');
    expect(words(out)).toContain("Change the measurements");
    expect(words(out)).toContain("Or change the measurements and the wall materials are worked out again.");
    expect(out).not.toMatch(/Takeoff assumptions|Recalculate/i);
  });
});

describe("new-look words for lines the calculator couldn't work out", () => {
  const SCOPES = ["framing", "wall", "lining", "insulation", "concrete", "fixing", "deck", "subfloor", "cladding", "roofing", "fencing", "mystery"];

  it.each(SCOPES)("%s: plain words, no classic panel", (scope) => {
    for (const canMeasure of [false, true]) {
      const help = blockedLineHelp(`${scope} takeoff — needs dimensions before it can be quoted`, canMeasure);
      expect(help.text).not.toMatch(/Takeoff assumptions|Recalculate|takeoff/i);
      expect(help.text).toContain("Type how many below");
      expect(help.measure).toBe(canMeasure && ["framing", "wall", "lining"].includes(scope));
    }
  });

  it("the calculator's own insulation line says why, and offers no measurements", () => {
    const help = blockedLineHelp("Pink Batts Insulation R2.6", true);
    expect(help.text).toContain("Insulation goes on outside walls only");
    expect(help.measure).toBe(false);
  });

  it("generation notes that name the classic panel say what to do on this page", () => {
    const stored = [
      "Removed 3 deck-only material line(s) that don't belong to a wall job. Enter wall dimensions in Takeoff assumptions and recalculate.",
      "Wall materials couldn't be determined from the scan. Enter total wall length and height in Takeoff assumptions, then Recalculate.",
    ];
    expect(plainNote(stored[0], true)).toBe(
      "Removed 3 deck-only material line(s) that don't belong to a wall job. Change the measurements to work the wall materials out.",
    );
    expect(plainNote(stored[1], false)).toBe(
      "Wall materials couldn't be determined from the scan. Add the wall materials as lines yourself.",
    );
    expect(plainNote("Check the deck height", true)).toBe("Check the deck height");

    const out = html(
      <MoreToolsSheet
        quoteId="q-1"
        publicLink={null}
        hasPdf={false}
        lines={[]}
        jobSummary={null}
        notes={stored}
        bookedDate={null}
        dayNotes={[]}
        serverTools={[]}
        onMeasurements={noop}
        onClose={noop}
      />,
    );
    expect(out).not.toMatch(/Takeoff assumptions|Recalculate/i);
    expect(words(out)).toContain("Change the measurements to work the wall materials out.");
  });
});
