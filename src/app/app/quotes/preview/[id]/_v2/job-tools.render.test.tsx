// The old detailed editor's tools, moved onto the job page: where they're
// offered, and the send screen pointing at them (never at the old editor).
// Static HTML in node, like render.test.tsx.
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("../actions", () => ({
  saveQuoteChanges: vi.fn(),
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

import type { DimensionConfirmation, QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { JobScreen } from "./JobScreen";
import { withLines } from "./lines";
import { SendSheet } from "./sheets/SendSheet";
import { blockedFixes, type FixActions } from "./sheets/sender-parts";
import type { JobScreenProps } from "./types";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const noop = () => {};
const ok = async () => ({ ok: true as const });

const LABOUR: QuoteLineItem = { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };
const DECKING: QuoteLineItem = { type: "material", description: "Decking 140x32", quantity: 42, unit: "length", unit_price: 36, line_total: 1512 };
/** Scanned in from a supplier at $1,400; the price has since changed, so it no longer matches. */
const SUPPLIER_OFF: QuoteLineItem = { ...DECKING, source_description: "KWILA 140X32 5.4M", source_line_total: 1400 };
/** Scanned in and still matching the supplier's total. */
const SUPPLIER_OK: QuoteLineItem = { ...DECKING, source_description: "KWILA 140X32 5.4M", source_line_total: 1512 };

const quote = (lines: QuoteLineItem[], extra: Partial<QuoteData> = {}): QuoteData => ({
  ...withLines(
    {
      client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
      job_summary: "New kwila deck at 14 Rata St",
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
    { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
  ),
  ...extra,
});

const SIZES: DimensionConfirmation = {
  required: true,
  reasons: ["no_scale"],
  takeoff_type: "deck",
  dimensions: [{ key: "deckLengthM", label: "Deck length", value: 6, unit: "m", confirmed: false }],
};

function props(patch: Partial<JobScreenProps> = {}): JobScreenProps {
  return {
    quoteId: "5d0a1c2e-5555-4666-8777-988888888888",
    quoteNumber: "Q-2026-5D0A",
    status: "draft",
    data: quote([LABOUR, DECKING]),
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
    ...patch,
  };
}

const screen = (patch: Partial<JobScreenProps> = {}) => html(createElement(JobScreen, props(patch)));

const sendProps = (patch: Partial<ComponentProps<typeof SendSheet>> = {}): ComponentProps<typeof SendSheet> => ({
  quoteId: "q1",
  firstName: "Sam",
  status: "draft",
  data: quote([LABOUR]),
  description: null,
  hasBusinessName: true,
  smsEnabled: false,
  mode: "send",
  publicLink: null,
  saveFirst: ok,
  onSent: noop,
  onDone: noop,
  onClose: noop,
  onFixClient: noop,
  ...patch,
});
const send = (patch: Partial<ComponentProps<typeof SendSheet>> = {}) => html(createElement(SendSheet, sendProps(patch)));

describe("the job page offers the old editor's tools itself", () => {
  it("never links to the old detailed editor", () => {
    for (const out of [screen(), screen({ data: quote([LABOUR, SUPPLIER_OFF]) }), screen({ status: "accepted" })]) {
      expect(out).not.toContain("view=classic");
      expect(out).not.toContain("detailed editor");
    }
  });

  it("Add from a plan photo sits with the line buttons, full width when it's the only extra", () => {
    const out = screen();
    expect(out).toContain('data-testid="job-plan-photo-open"');
    expect(out).toContain("Add from a plan photo");
    expect(out).toContain("sm:col-span-2");
    expect(out).not.toContain('data-testid="job-measurements-open"');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("Change the measurements is offered on the page only for a wall worked out from measurements", () => {
    const out = screen({ data: quote([LABOUR, DECKING], { takeoff_inputs: { wallLengthM: 12, wallHeightM: 2.4, gibSides: 2 } }) });
    expect(out).toContain('data-testid="job-measurements-open"');
    expect(out).toContain("Change the measurements");
    expect(out).not.toContain("sm:col-span-2");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a deck or cladding quote never gets the wall form under its lines", () => {
    for (const takeoff of [
      { takeoff_inputs: { deckLengthM: 4.8, deckWidthM: 3 } },
      { takeoff_inputs: { wallLengthM: 20, wallHeightM: 2.4 }, takeoff_type: "cladding" },
    ]) {
      const out = screen({ data: quote([LABOUR, DECKING], takeoff as never) });
      expect(out).not.toContain("job-measurements-open");
      expect(out).not.toContain("Change the measurements");
    }
  });

  it("an accepted quote offers neither: its lines can't change", () => {
    const out = screen({ status: "accepted", data: quote([LABOUR, DECKING], { takeoff_inputs: { wallLengthM: 12 } }) });
    expect(out).not.toContain("job-plan-photo-open");
    expect(out).not.toContain("job-measurements-open");
  });

  it("a supplier line that no longer matches: a callout says so and opens the check", () => {
    const out = screen({ data: quote([LABOUR, SUPPLIER_OFF]) });
    expect(out).toContain("1 line doesn&#x27;t match the supplier&#x27;s quote");
    expect(out).toContain('data-testid="job-check-supplier"');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a supplier quote that still matches, or an accepted one, has no callout", () => {
    expect(screen({ data: quote([LABOUR, SUPPLIER_OK]) })).not.toContain("job-check-supplier");
    expect(screen({ status: "accepted", data: quote([LABOUR, SUPPLIER_OFF]) })).not.toContain("job-check-supplier");
  });
});

describe("the send screen points at the fix on the job page", () => {
  it("a supplier line off: Check against the supplier's quote, and no fallback beside it", () => {
    const out = send({ data: quote([LABOUR, SUPPLIER_OFF]), fixes: { onFixSupplier: noop, onBackToJob: noop } });
    expect(out).toContain("Fix these before it can go");
    expect(out).toContain("Decking 140x32 no longer matches the supplier&#x27;s quote.");
    expect(out).toContain('data-fix="supplier"');
    expect(out).not.toContain('data-fix="job"');
    expect(out).not.toContain("detailed editor");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("sizes still to confirm: Check the sizes", () => {
    const out = send({ data: quote([LABOUR], { dimension_confirmation: SIZES }), fixes: { onFixSizes: noop } });
    expect(out).toContain("Fix these before it can go");
    expect(out).toContain('data-fix="sizes"');
  });

  it("a failed quantity check: Change the measurements", () => {
    const failed = quote([LABOUR, DECKING], { takeoff_evaluation: { status: "fail", reasons: ["Stud count is off for a 12 m wall."], confidence: 0.4 } });
    const out = send({ data: failed, fixes: { onFixMeasurements: noop } });
    expect(out).toContain("Stud count is off for a 12 m wall.");
    expect(out).toContain('data-fix="measurements"');
  });

  it("blocked by something the page can't point at: Back to the job, and nothing old", () => {
    const failed = quote([LABOUR, DECKING], { takeoff_evaluation: { status: "fail", reasons: ["Deck joists don't add up."], confidence: 0.4 } });
    const out = send({ data: failed, fixes: { onBackToJob: noop } });
    expect(out).toContain('data-fix="job"');
    expect(out).toContain("Back to the job");
    expect(out).not.toContain("detailed editor");
  });

  it("no lines yet: the fix is Add a line", () => {
    const out = send({ data: quote([]), fixes: { onAddLines: { label: "Add a line", onClick: noop } } });
    expect(out).toContain("Add a line");
    expect(out).not.toContain("detailed editor");
  });
});

describe("blockedFixes", () => {
  const base: FixActions = { onFixClient: noop };

  it("offers one button per problem, lines first", () => {
    const keys = blockedFixes({
      ...base,
      onFixMeasurements: noop,
      onFixSupplier: noop,
      onFixSizes: noop,
      onFixLines: noop,
      onBackToJob: noop,
    }).map((fix) => fix.key);
    expect(keys).toEqual(["lines", "sizes", "supplier", "measurements"]);
  });

  it("falls back to Back to the job only when nothing else applies", () => {
    expect(blockedFixes({ ...base, onBackToJob: noop }).map((fix) => fix.label)).toEqual(["Back to the job"]);
    expect(blockedFixes(base)).toEqual([]);
  });
});
