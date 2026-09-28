// "Add a kit" on the new job page: the control next to "Add a line" (only
// while kits are switched on) and the sheet listing the tradie's kits.
// Rendered to static HTML in node like the page's other markup contracts.
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

import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { JobScreen } from "./JobScreen";
import { KITS_PAGE, type JobKit } from "./kits";
import { withLines } from "./lines";
import { KitSheetView, type KitSheetViewProps } from "./sheets/KitSheet";
import type { JobScreenProps } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const CYLINDER: JobKit = {
  id: "kit-1",
  name: "Hot-water cylinder swap",
  total: 1847.5,
  items: [
    { type: "labour", description: "Swap the cylinder", quantity: 5, unit: "hour", unit_price: 95 },
    { type: "material", description: "180 L mains cylinder", quantity: 1, unit: "each", unit_price: 1250 },
    { type: "material", description: "Copper pipe 15 mm", quantity: 3, unit: "m", unit_price: 17.5 },
  ],
};
const TAP: JobKit = {
  id: "kit-2",
  name: "Mixer tap",
  total: 289,
  items: [{ type: "material", description: "Mixer tap", quantity: 1, unit: "each", unit_price: 289 }],
};
const EMPTY_KIT: JobKit = { id: "kit-3", name: "Started, not finished", total: 0, items: [] };

const view = (patch: Partial<KitSheetViewProps> = {}) =>
  html(<KitSheetView kits={[CYLINDER, TAP]} currency="NZD" adding={null} error={null} onPick={noop} onClose={noop} {...patch} />);

describe("the kit sheet", () => {
  it("lists each kit with its line count and total, each a tap to add", () => {
    const out = view();
    expect(out).toMatch(/<h2 [^>]*>Add a kit<\/h2>/);
    expect(words(out)).toContain("Tap a kit to add all its lines to this quote.");
    const cylinder = out.slice(out.indexOf('data-kit="kit-1"'), out.indexOf('data-kit="kit-2"'));
    expect(words(cylinder)).toContain("Hot-water cylinder swap");
    expect(words(cylinder)).toContain("3 lines");
    expect(cylinder).toContain('data-amount="1847.5"');
    expect(cylinder).toMatch(/<button type="button"/);
    const tap = out.slice(out.indexOf('data-kit="kit-2"'));
    expect(words(tap)).toContain("1 line");
    expect(tag(out, "Change your kits")).toBeTruthy();
    expect(out).toContain(`href="${KITS_PAGE}"`);
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("while one kit is being added, it says so and no kit can be tapped", () => {
    const out = view({ adding: "kit-1" });
    const cylinder = out.slice(out.indexOf('data-kit="kit-1"'), out.indexOf('data-kit="kit-2"'));
    expect(cylinder).toContain('aria-busy="true"');
    expect(words(cylinder)).toContain("Adding…");
    expect(out.slice(out.indexOf('data-kit="kit-1"'))).not.toMatch(/<button type="button"[^>]*class="[^"]*min-h-16/);
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a kit with no lines can't be added", () => {
    const out = view({ kits: [EMPTY_KIT] });
    expect(words(out)).toContain("No lines yet");
    expect(out.slice(out.indexOf('data-kit="kit-3"'))).not.toMatch(/<button type="button"[^>]*class="[^"]*min-h-16/);
  });

  it("a save that failed is read out", () => {
    const out = view({ error: "That didn't save. Check your signal and try again." });
    expect(tag(out, 'role="alert"')).toBeTruthy();
    expect(words(out)).toContain("That didn't save. Check your signal and try again.");
  });

  it("no kits yet: says how to make one, with the way to the Kits page", () => {
    const out = view({ kits: [] });
    expect(words(out)).toContain("No kits yet");
    expect(words(out)).toContain("Save the lines you use on most jobs as a kit");
    const link = tag(out, 'data-testid="job-kits-make"');
    expect(link).toContain(`href="${KITS_PAGE}"`);
    expect(words(out)).toContain("Make a kit");
    expect(out).not.toContain("Change your kits");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

const LABOUR: QuoteLineItem = { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };

function props(patch: Partial<JobScreenProps> = {}): JobScreenProps {
  const data: QuoteData = withLines(
    {
      client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
      job_summary: "Cylinder swap",
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
    [LABOUR],
  );
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
    ...patch,
  };
}

describe("Add a kit on the job page", () => {
  it("sits next to Add a line while kits are on (even with none made yet)", () => {
    for (const kits of [[CYLINDER], []]) {
      const out = html(createElement(JobScreen, props({ kits })));
      const button = tag(out, 'data-testid="job-kits-open"');
      expect(button).toContain('data-variant="secondary"');
      expect(words(out)).toContain("Add a kit");
      expect(out.indexOf("Add a line")).toBeLessThan(out.indexOf("Add a kit"));
      // Four add buttons: two to a row, none spanning.
      expect(tag(out, 'data-testid="job-plan-photo-open"')).not.toContain("sm:col-span-2");
    }
  });

  it("is hidden while kits are switched off, and on a locked quote", () => {
    expect(html(createElement(JobScreen, props({ kits: null })))).not.toContain("job-kits-open");
    expect(html(createElement(JobScreen, props()))).not.toContain("job-kits-open");
    expect(html(createElement(JobScreen, props({ kits: [CYLINDER], status: "accepted" })))).not.toContain("job-kits-open");
    // Without it the plan-photo button fills its row again.
    expect(tag(html(createElement(JobScreen, props({ kits: null }))), 'data-testid="job-plan-photo-open"')).toContain(
      "sm:col-span-2",
    );
  });
});
