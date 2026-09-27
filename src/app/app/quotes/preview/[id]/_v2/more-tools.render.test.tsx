// "More tools" on the new job page: the job tools inside it are drawn in the
// new look (kit parts, ui- tokens, so nothing goes white-on-white in outdoor
// mode), and the words the 3D site's recorded clip shows stay as they are.
// Rendered to static HTML in node, like the page's other markup contracts.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/app/app/_components/calendar-notes-actions", () => ({ addCalendarNote: vi.fn() }));

import { buttonClasses } from "@/components/ui/button";
import type { QuoteLineItem } from "@/lib/quote-types";
import { markupRuleBreaks } from "@/test/design-rules";
import { MoreToolsSheet, type MoreToolsSheetProps } from "./sheets/MoreToolsSheet";

const noop = () => {};
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};
/** One tool's markup: its <details>, whole. */
const tool = (markup: string, id: string) => {
  const start = markup.indexOf(`<details id="tool-${id}"`);
  expect(start, id).toBeGreaterThanOrEqual(0);
  return markup.slice(start, markup.indexOf("</details>", start) + "</details>".length);
};

const LABOUR: QuoteLineItem = { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };
/** The line the 3D site's clip opens: what Deck board layout sends. */
const DECKING: QuoteLineItem = {
  type: "material",
  description: "Decking lineal length to order",
  quantity: 184.8,
  unit: "m",
  unit_price: 8,
  line_total: 1478.4,
  quantity_source: "calculator",
  t2qcal_calculator_snapshot: {
    toolSlug: "deck-boards",
    toolName: "Deck board layout",
    inputs: [
      { key: "runLength", label: "Board run length", value: 6000, unit: "mm", displayLabel: "6,000 mm" },
      { key: "deckWidth", label: "Deck width", value: 4000, unit: "mm", displayLabel: "4,000 mm" },
      { key: "waste", label: "Waste allowance", value: 10, unit: "%", displayLabel: "10 %" },
    ],
  },
};
const JOISTS: QuoteLineItem = {
  type: "material",
  description: "Deck joists (4.8m stock)",
  quantity: 10,
  unit: "lengths",
  unit_price: 42,
  line_total: 420,
  formula: "ceil(joistCount=12 × widthM=4 × (1+10/100) / 5.4m) = 10",
  takeoff_status: "needs_review",
};

const props = (patch: Partial<MoreToolsSheetProps> = {}): MoreToolsSheetProps => ({
  quoteId: "5d0a1c2e-5555-4666-8777-988888888888",
  publicLink: "https://tradies2quote.example/quote/tok-1",
  hasPdf: true,
  lines: [LABOUR, DECKING, JOISTS],
  jobSummary: "6 × 4 m deck",
  notes: ["Check the deck height", "Confirm the board colour"],
  bookedDate: "2026-10-02",
  dayNotes: [{ id: "n1", body: "Bring the long ladder" }],
  serverTools: [{ id: "chat", title: "Customer chat", subtitle: "What your client asked", content: <p>No questions yet.</p> }],
  onDecline: noop,
  onClose: noop,
  ...patch,
});

const sheet = (patch: Partial<MoreToolsSheetProps> = {}) => renderToStaticMarkup(<MoreToolsSheet {...props(patch)} />);

describe("More tools in the new look", () => {
  const markup = sheet();

  it("follows the design rules, every job tool included", () => {
    expect(markupRuleBreaks(markup)).toEqual([]);
    for (const old of ["t2q-", "font-mono", "font-display", "uppercase", "tracking-[", "bg-ink", "text-ink", "border-ink", "text-white", "hivis", "red-", "// "]) {
      expect(markup, old).not.toContain(old);
    }
  });

  it("keeps the words the 3D site's clip shows", () => {
    expect(markup).toMatch(/<h2 [^>]*>More tools<\/h2>/);
    expect(markup).toContain(">Everything else for this job.<");
    const working = tool(markup, "working");
    expect(working).toContain(">How the numbers were worked out<");
    expect(working).toContain(">Decking lineal length to order<");
    expect(working).toContain(">T2QCAL calculation record<");
    expect(working).toContain(">Deck board layout<");
    const rows = [...working.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], m[2]]);
    expect(rows).toEqual([
      ["Board run length", "6,000 mm"],
      ["Deck width", "4,000 mm"],
      ["Waste allowance", "10 %"],
    ]);
    // A calculator formula is explained in words next to its line.
    expect(working).toContain("round up of (12 joists × 4m wide + 10% waste ÷ 5.4m) = 10");
  });

  it("the PDF: the kit's secondary button, and the PDF the client got", () => {
    const pdf = tool(markup, "pdf");
    expect(tag(pdf, 'data-testid="save-pdf-button"')).toContain(buttonClasses({ variant: "secondary", fullWidth: true }));
    expect(pdf).toContain(">Download the PDF<");
    expect(pdf).toContain("See the PDF your client got");
  });

  it("photos, the materials list and the trade groups are the new-look tools", () => {
    const photos = tool(markup, "photos");
    expect(photos).toContain('<section class="space-y-3" aria-label="Quote photos">');
    expect(photos).not.toContain("Job photos");
    expect(tag(tool(markup, "materials-list"), 'data-testid="materials-list-button"')).toContain(
      buttonClasses({ variant: "secondary", fullWidth: true }),
    );
    const groups = tool(markup, "csi");
    expect(groups).toContain('data-testid="csi-grouped-view"');
    expect(groups).toMatch(/data-tone="warn"[^>]*>Needs review</);
  });

  it("the client's link, notes for the job day and things to check", () => {
    const link = tool(markup, "link");
    expect(link).toContain("Copy the link");
    expect(link).toMatch(/<a href="https:\/\/tradies2quote\.example\/quote\/tok-1" target="_blank"[^>]*>(?:(?!<\/a>)[\s\S])*Open it<\/a>/);
    expect(tool(markup, "day-notes")).toContain("Bring the long ladder");
    const checks = tool(markup, "quote-notes");
    expect(checks).toContain(">2 notes<");
    expect(checks).toContain("<li>Check the deck height</li>");
  });

  it("leaves out what the job doesn't have", () => {
    const bare = sheet({ publicLink: null, bookedDate: null, notes: [], lines: [LABOUR], serverTools: [] });
    for (const id of ["link", "day-notes", "quote-notes", "materials-list", "working"]) {
      expect(bare).not.toContain(`id="tool-${id}"`);
    }
    expect(bare).toContain('id="tool-pdf"');
    expect(bare).toContain('id="tool-csi"');
    expect(markupRuleBreaks(bare)).toEqual([]);
  });
});
