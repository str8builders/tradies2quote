// Where each number came from, on the job page's line list: the classic
// editor's source badges as small pills in words, and the supplier's page as
// its own link beside them. Rendered to static HTML in node like the page's
// other markup contracts.
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

import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { JobScreen } from "./JobScreen";
import { withLines } from "./lines";
import { LineList } from "./parts/LineList";
import type { JobScreenProps, LineLibraryItem } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
/** One line's <li>…</li>. */
const row = (markup: string, index: number) => {
  const open = tag(markup, `data-line-index="${index}"`);
  const start = markup.indexOf(open);
  return markup.slice(start, markup.indexOf("</li>", start) + 5);
};

const LABOUR: QuoteLineItem = { type: "labour", description: "Build the deck", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };
const DECKING: QuoteLineItem = {
  type: "material",
  description: "Decking 140x32",
  quantity: 42,
  unit: "length",
  unit_price: 36,
  line_total: 1512,
  library_id: "lib-deck",
  price_source: "user_library",
};
const JOISTS: QuoteLineItem = {
  type: "material",
  description: "Joists 140x45 H3.2",
  quantity: 9,
  unit: "length",
  unit_price: 0,
  line_total: 0,
  is_missing_price: true,
  is_calculated_takeoff: true,
  quantity_source: "calculator",
  takeoff_status: "ok",
  library_id: "lib-joist",
};
const SCREWS: QuoteLineItem = {
  type: "material",
  description: "Deck screws",
  quantity: 2,
  unit: "box",
  unit_price: 48,
  line_total: 96,
  is_ai_estimated: true,
};
const TYPED: QuoteLineItem = { type: "material", description: "Stain", quantity: 1, unit: "each", unit_price: 89, line_total: 89 };

const LIBRARY: LineLibraryItem[] = [
  {
    id: "lib-deck",
    name: "Kwila decking 140x32",
    default_unit_price: 36,
    supplier: "Bunnings",
    supplier_url: "https://www.bunnings.co.nz/kwila-140x32",
    is_ai_estimated: false,
  },
  {
    id: "lib-joist",
    name: "Joist 140x45 H3.2",
    default_unit_price: null,
    supplier: "ITM",
    supplier_url: "https://www.itm.co.nz/joist-140x45",
    is_ai_estimated: false,
  },
];

const list = (onOpen?: (index: number) => void, libraryMatches: LineLibraryItem[] | null = LIBRARY) =>
  html(
    createElement(LineList, {
      lines: [LABOUR, DECKING, JOISTS, SCREWS, TYPED],
      currency: "NZD",
      libraryMatches: libraryMatches ?? undefined,
      onOpen,
    }),
  );

describe("line list: where each number came from", () => {
  const out = list(() => {});

  it("a library price says 'Your library', with the supplier's page as a link", () => {
    const deck = row(out, 1);
    expect(tag(deck, "<li")).toContain('data-source="library"');
    expect(deck).toContain(">Your library<");
    expect(tag(deck, 'data-tone="ok"')).toContain("text-ui-ok");
    expect(tag(deck, 'data-testid="job-line-supplier"')).toContain('href="https://www.bunnings.co.nz/kwila-140x32"');
    expect(deck).toContain("See it at Bunnings");
  });

  it("the supplier link opens in a new tab, is its own tap target and sits outside the row's button", () => {
    const deck = row(out, 1);
    const link = tag(deck, 'data-testid="job-line-supplier"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).toContain("min-h-11");
    // The row's button closes before the pills and link start.
    expect(deck.indexOf("</button>")).toBeLessThan(deck.indexOf('data-testid="job-line-source"'));
    expect(deck.slice(deck.indexOf("<button"), deck.indexOf("</button>"))).not.toContain("<a ");
  });

  it("a calculated line still needing a price: 'Calculated', its supplier's page, and the row's own 'Needs price'", () => {
    const joists = row(out, 2);
    expect(tag(joists, "<li")).toContain('data-source="calculated"');
    expect(joists).toContain(">Calculated<");
    expect(joists).toContain("Needs price");
    expect(joists).toContain("See it at ITM");
  });

  it("a T2Q estimate says so, in the warn tone", () => {
    const screws = row(out, 3);
    expect(tag(screws, "<li")).toContain('data-source="estimate"');
    expect(screws).toContain(">T2Q estimate<");
    expect(tag(screws, 'data-tone="warn"')).toContain("text-ui-warn");
    expect(screws).not.toContain("job-line-supplier");
  });

  it("labour and a price typed on the job carry nothing extra", () => {
    for (const index of [0, 4]) {
      const plain = row(out, index);
      expect(tag(plain, "<li")).not.toContain("data-source");
      expect(plain).not.toContain("job-line-source");
    }
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("line list: locked, or without the library", () => {
  it("a locked quote keeps the rows plain and the pills and links", () => {
    const out = list(undefined);
    const deck = row(out, 1);
    expect(deck.slice(tag(deck, "<li").length).startsWith("<div")).toBe(true);
    expect(deck).not.toContain("<button");
    expect(deck).toContain(">Your library<");
    expect(deck).toContain("See it at Bunnings");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("without the library items: the stored price source still shows, no links", () => {
    const out = list(() => {}, null);
    expect(row(out, 1)).toContain(">Your library<");
    expect(row(out, 2)).toContain(">Calculated<");
    expect(out).not.toContain("job-line-supplier");
  });
});

describe("job page passes the matched library to the list", () => {
  const data: QuoteData = withLines(
    {
      client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
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
    [LABOUR, DECKING],
  );
  const props = (patch: Partial<JobScreenProps> = {}): JobScreenProps => ({
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
  });

  it("the supplier's page reaches the job page's rows", () => {
    const out = html(createElement(JobScreen, props({ libraryMatches: LIBRARY })));
    expect(out).toContain(">Your library<");
    expect(out).toContain('href="https://www.bunnings.co.nz/kwila-140x32"');
  });

  it("an older server render without it still shows the stored source", () => {
    const out = html(createElement(JobScreen, props()));
    expect(out).toContain(">Your library<");
    expect(out).not.toContain("job-line-supplier");
  });
});
