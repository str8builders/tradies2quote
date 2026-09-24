// Markup contracts for the new job page, rendered to static HTML in node like
// the kit's own tests: the next-step button per status, locked quotes read
// only, the send sheet's gating, the price keypad and the edit sheet.
import { createElement, type ComponentProps, type ReactElement } from "react";
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

import { ToastProvider } from "@/components/ui/toast";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import type { QuoteVideoStatus } from "@/lib/quote-video/status";
import { QuoteVideoCard } from "../_components/QuoteVideoCard";
import { JobScreen, barButtonCount, toastOffsetClass } from "./JobScreen";
import { jobView } from "./job-view";
import { withLines } from "./lines";
import { LineList } from "./parts/LineList";
import { QuoteVideoCardV2View } from "./parts/QuoteVideoCardV2View";
import { InvoiceSheet } from "./sheets/InvoiceSheet";
import { LineSheet } from "./sheets/LineSheet";
import { PriceSheet } from "./sheets/PriceSheet";
import { SendSheet, SentSheet } from "./sheets/SendSheet";
import type { JobInvoice, JobScreenProps } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
const ok = async () => ({ ok: true as const });
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const LABOUR: QuoteLineItem = { type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 560, line_total: 1680 };
const DECKING: QuoteLineItem = { type: "material", description: "Decking 140x32", quantity: 42, unit: "length", unit_price: 36, line_total: 1512 };
const HANGERS: QuoteLineItem = {
  type: "material",
  description: "Joist hangers 190 mm",
  quantity: 28,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  is_missing_price: true,
};

const quote = (lines: QuoteLineItem[], client: Partial<QuoteData["client"]> = {}): QuoteData =>
  withLines(
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
    { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101", ...client },
  );

const invoice = (status: JobInvoice["status"]): JobInvoice => ({
  id: "inv-1",
  number: "INV-0012",
  status,
  total: 4830,
  currency: "NZD",
  dueOn: "2 Oct",
  daysLate: 0,
  paidOn: status === "paid" ? "3 Oct" : null,
});

function props(patch: Partial<JobScreenProps> = {}): JobScreenProps {
  return {
    quoteId: "5d0a1c2e-5555-4666-8777-988888888888",
    quoteNumber: "Q-2026-5D0A",
    status: "draft",
    data: quote([LABOUR, DECKING, HANGERS]),
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
/** The big next-step button's opening tag and label. */
const nextButton = (markup: string) => {
  const open = tag(markup, 'data-testid="job-next"');
  const start = markup.indexOf(open) + open.length;
  return { open, text: markup.slice(start, markup.indexOf("</", start)).replace(/<[^>]+>/g, "") };
};

describe("job page: the next step per status", () => {
  it("draft: rail waiting on Sent, 'Send to Sam' at the thumb, prices called out", () => {
    const out = screen();
    expect(out).toContain('data-position="Sent"');
    expect(nextButton(out).text).toContain("Send to Sam");
    expect(out).toContain("Next: add your prices, then send it to Sam.");
    expect(out).toContain("1 item needs your price");
    expect(out).toContain('data-testid="job-price-them"');
    expect(out).toContain("Needs price");
    expect(out).not.toContain("job-invoice-card");
  });

  it("the title is the job in plain words, the client under it, Back to the jobs", () => {
    const out = screen();
    expect(out).toMatch(/<h1[^>]*>New kwila deck at 14 Rata St<\/h1>/);
    expect(out).toContain(">Sam Taylor</p>");
    expect(out).toContain('href="/app/jobs"');
  });

  it("sent: remind is the big button, 'They said yes' the second", () => {
    const out = screen({ status: "sent", data: quote([LABOUR]), dates: { sentOn: "22 Sept" } });
    expect(out).toContain('data-position="Accepted"');
    expect(nextButton(out).text).toContain("Send a reminder");
    expect(out).toContain('data-testid="job-next-secondary"');
    expect(out).toContain("They said yes");
    expect(out).toContain("Sent 22 Sept. Waiting for Sam to say yes.");
  });

  it("accepted: Book the job", () => {
    const out = screen({ status: "accepted", data: quote([LABOUR]) });
    expect(out).toContain('data-position="Booked"');
    expect(nextButton(out).text).toContain("Book the job");
  });

  it("scheduled and in progress: start, then Job done", () => {
    expect(nextButton(screen({ status: "scheduled", data: quote([LABOUR]) })).text).toContain("Start the job");
    const started = screen({ status: "in_progress", data: quote([LABOUR]) });
    expect(started).toContain('data-position="Done"');
    expect(started).toContain("Job started");
    expect(nextButton(started).text).toContain("Job done");
  });

  it("completed: the invoice lives in the job, send it", () => {
    const out = screen({ status: "completed", data: quote([LABOUR]) });
    expect(out).toContain('data-position="Paid"');
    expect(nextButton(out).text).toContain("Send invoice");
    expect(out).toContain('data-invoice-status="none"');
    expect(out).toContain("No invoice yet");
  });

  it("invoice sent: mark as paid, or remind", () => {
    const out = screen({ status: "completed", data: quote([LABOUR]), invoice: invoice("sent") });
    expect(nextButton(out).text).toContain("Mark as paid");
    expect(out).toContain("Send a reminder");
    expect(out).toContain('data-invoice-status="sent"');
    expect(out).toContain("Due 2 Oct");
  });

  it("paid: the whole line is done and the bar is a calm 'Paid'", () => {
    const out = screen({ status: "completed", data: quote([LABOUR]), invoice: invoice("paid") });
    expect(out).toContain('data-position="complete"');
    expect(out).not.toContain('data-testid="job-next"');
    expect(out).toContain("Paid. Nice work.");
  });

  it("declined: says so plainly and offers to send it again", () => {
    const out = screen({ status: "declined", data: quote([LABOUR]) });
    expect(out).toContain("Sam said no");
    expect(nextButton(out).text).toContain("Send it again");
  });

  it("run out: says so and the big button starts a new quote", () => {
    const out = screen({ status: "sent", pastExpiry: true, data: quote([LABOUR]), dates: { expiresOn: "12 Sept" } });
    expect(out).toContain("This quote has run out");
    expect(out).toContain("It ran out on 12 Sept, so Sam can&#x27;t accept it any more.");
    const next = nextButton(out);
    expect(next.open).toContain('href="/app/quotes/new"');
    expect(next.text).toContain("Start a new quote");
  });

  it("says when lines were left out by the review guard (never silent)", () => {
    expect(screen({ stripped: ["Deck joists"] })).toContain("1 line was left out");
  });
});

describe("locked quotes are read-only", () => {
  const locked = () => screen({ status: "scheduled", data: quote([LABOUR, DECKING]) });

  it("says why in one plain line", () => {
    expect(locked()).toContain("Sam said yes to this price, so the lines can&#x27;t change now.");
  });

  it("has no add, scan, price or edit controls", () => {
    const out = locked();
    expect(out).not.toContain("Add a line");
    expect(out).not.toContain("scan-barcode-button");
    expect(out).not.toContain("job-price-them");
    expect(out).not.toMatch(/>Edit</);
  });

  it("shows the lines as plain rows, not buttons", () => {
    const out = locked();
    const row = tag(out, 'data-line-index="0"');
    const after = out.slice(out.indexOf(row) + row.length, out.indexOf(row) + row.length + 12);
    expect(after.startsWith("<div")).toBe(true);
  });

  it("an editable quote's rows open the edit sheet", () => {
    const out = screen();
    const row = tag(out, 'data-line-index="0"');
    expect(out.slice(out.indexOf(row) + row.length).startsWith("<button")).toBe(true);
    expect(out).toContain("Add a line");
    expect(out).toContain("scan-barcode-button");
  });
});

describe("line cards", () => {
  it("say what, how many and how much, or one plain marker", () => {
    const out = html(
      createElement(LineList, {
        lines: [DECKING, HANGERS, { ...DECKING, description: "Guessed", quantity_source: "ai" as const }],
        currency: "NZD",
      }),
    );
    expect(out).toContain("Decking 140x32");
    expect(out).toContain("42 length × $36.00");
    expect(out).toContain("$1,512.00");
    expect(out).toContain("Needs price");
    expect(out).toContain("Check this");
    expect(out).not.toMatch(/From your library|T2Q estimate|Calculated takeoff/);
  });
});

describe("the bottom bar and toasts", () => {
  it("toasts clear the bar (1 or 2 buttons, or none)", () => {
    const view = (status: string, inv: JobInvoice | null = null) =>
      jobView({ status, generated: true, clientFirstName: null, pastExpiry: false, invoice: inv });
    expect(barButtonCount(view("draft"))).toBe(1);
    expect(barButtonCount(view("sent"))).toBe(2);
    expect(barButtonCount(view("completed", invoice("paid")))).toBe(0);
    expect(toastOffsetClass(2)).toContain("[--job-toast:calc(9.25rem+env(safe-area-inset-bottom))]");
  });

  it("sits on the bottom edge: the job page is a focused route, so the tab bar is hidden", () => {
    const out = screen();
    expect(out).not.toContain("5.3rem");
    expect(out).toContain("pb-[max(env(safe-area-inset-bottom),0.75rem)]");
  });
});

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
const primary = (markup: string) => tag(markup, 'data-testid="job-send-primary"');

describe("send sheet gating (the classic send gate, before the tap)", () => {
  it("ready: send by email to the client's address", () => {
    const out = send();
    expect(out).toContain("Send to Sam");
    expect(out).toContain("sam@example.invalid");
    expect(primary(out)).not.toContain("disabled");
    expect(out).toContain("Send by email");
  });

  it("a platform text sender adds text as the second choice", () => {
    const out = send({ smsEnabled: true });
    expect(out).toContain("Text message");
    expect(out).toContain("+64215550101");
    expect(out).toContain("Send by text");
  });

  it("$0 lines need an explicit 'send it anyway' before either button works", () => {
    const out = send({ data: quote([LABOUR, HANGERS]) });
    expect(out).toContain("Check these before you send");
    expect(out).toContain("Joist hangers 190 mm");
    expect(out).toContain("I&#x27;ve checked these. Send it anyway.");
    expect(primary(out)).toContain("disabled");
    expect(out).toContain("Send anyway by email");
  });

  it("hard blocks can't be sent, and point at the fix", () => {
    const out = send({ data: quote([{ ...DECKING, quantity_source: "ai", quantity_confirmed: false }]), onFixLines: noop });
    expect(out).toContain("Fix these before it can go");
    expect(out).toContain("Show me the lines");
    expect(out).toContain("Open the detailed editor");
    expect(primary(out)).toContain("disabled");
  });

  it("no email and no mobile: says what to add, with the client sheet one tap away", () => {
    const out = send({ data: quote([LABOUR], { email: null, phone: null }), smsEnabled: true });
    expect(out).toContain("Add an email address first.");
    expect(out).toContain("Add a mobile number first.");
    expect(out).toContain("Edit the client");
    expect(primary(out)).toContain("disabled");
  });

  it("no email but a mobile: text becomes the main button", () => {
    const out = send({ data: quote([LABOUR], { email: null }), smsEnabled: true });
    expect(primary(out)).not.toContain("disabled");
    expect(out).toContain("Send by text");
  });

  it("a missing business name points to Settings and holds the send", () => {
    const out = send({ hasBusinessName: false });
    expect(out).toContain("Add your business name first");
    expect(out).toContain('href="/app/settings"');
    expect(primary(out)).toContain("disabled");
  });

  it("after a no, the same sheet sends it again", () => {
    expect(send({ mode: "resend", status: "declined" })).toContain("Send it to Sam again");
  });

  it("once it has gone, offers the client's link to copy (it arrives with the refresh)", () => {
    const withLink = html(createElement(SentSheet, { who: "Sam", channel: "email", publicLink: "https://t2q.test/quote/abc", onDone: noop }));
    expect(withLink).toContain("Sent to Sam");
    expect(withLink).toContain("Copy the link");
    expect(withLink).toContain('data-testid="job-send-done"');
    const waiting = html(createElement(SentSheet, { who: "Sam", channel: "sms", publicLink: null, onDone: noop }));
    expect(waiting).toContain("Getting the link…");
    expect(waiting).toContain("They&#x27;ll get a text with the quote.");
  });
});

describe("price keypad sheet", () => {
  const sheet = (lines: QuoteLineItem[], startAt?: number) =>
    html(
      createElement(
        ToastProvider,
        null,
        createElement(PriceSheet, { lines, startAt, currency: "NZD", onSavePrice: ok, onDone: noop, onClose: noop }),
      ),
    );

  it("asks one line at a time, with the keypad and 'Remember for next time' on", () => {
    const out = sheet([LABOUR, HANGERS, { ...LABOUR, description: "Travel", unit_price: 0, line_total: 0 }]);
    expect(out).toContain("What do you pay for this?");
    expect(out).toContain("1 of 2");
    expect(out).toContain("Joist hangers 190 mm");
    expect(out).toContain("28 each on this job");
    expect(out).toContain('aria-label="Number pad"'.replace("Number pad", "Price for Joist hangers 190 mm"));
    expect(out).toContain("Remember for next time");
    expect(tag(out, 'role="switch"')).toContain('aria-checked="true"');
    expect(tag(out, 'data-testid="job-price-save"')).toContain("disabled");
    expect(out).toContain("Save and next");
  });

  it("labour asks what you charge, without Remember (only materials go to the library)", () => {
    const out = sheet([{ ...LABOUR, unit_price: 0, line_total: 0 }]);
    expect(out).toContain("What do you charge for this?");
    expect(out).not.toContain("Remember for next time");
    expect(out).toContain("Save and finish");
  });
});

describe("line edit sheet", () => {
  const edit = (line: QuoteLineItem) =>
    html(
      createElement(LineSheet, {
        mode: { kind: "edit", index: 0, line },
        currency: "NZD",
        onSave: ok,
        onDelete: ok,
        onClose: noop,
      }),
    );

  it("edits description, quantity, unit and price, and can delete", () => {
    const out = edit(DECKING);
    expect(out).toContain("What is it?");
    expect(out).toContain("How many?");
    expect(out).toContain("Unit");
    expect(out).toContain("Price per length");
    expect(out).toContain("Delete this line");
    expect(out).not.toContain("The quantity is right");
  });

  it("an estimated quantity asks to be checked", () => {
    expect(edit({ ...DECKING, quantity_source: "ai", quantity_confirmed: false })).toContain("The quantity is right");
  });

  it("a blocked line says which size it needs", () => {
    const out = edit({ ...DECKING, description: "Deck takeoff — needs dimensions", quantity: 0, takeoff_status: "blocked" });
    expect(out).toContain("This line needs a size");
  });

  it("a new line picks its kind first", () => {
    const out = html(createElement(LineSheet, { mode: { kind: "new" }, currency: "NZD", onSave: ok, onClose: noop }));
    expect(out).toContain("What kind of line?");
    expect(out).toContain("Add the line");
    expect(out).not.toContain("Delete this line");
  });
});

describe("quote video card in the new look", () => {
  const READY: QuoteVideoStatus = { kind: "ready", videoUrl: "https://x.test/v.mp4", posterUrl: "https://x.test/p.jpg", fileName: "q.mp4" };

  it("keeps the container's behaviour and test ids, drawn with the kit", () => {
    const out = html(createElement(QuoteVideoCard, { quoteId: "q1", initialStatus: READY, view: QuoteVideoCardV2View }));
    expect(out).toContain('data-testid="quote-video-card"');
    expect(out).toContain('data-state="ready"');
    expect(out).toContain('data-testid="quote-video-share"');
    expect(out).toContain("Share video");
    expect(out).toContain("rounded-ui-lg");
    expect(out).not.toContain("t2q-card-pro");
  });

  it("the classic page's card is unchanged without a view", () => {
    const out = html(createElement(QuoteVideoCard, { quoteId: "q1", initialStatus: { kind: "none" } }));
    expect(out).toContain("t2q-card-pro");
    expect(out).toContain("Make a quote video");
  });
});

describe("invoice sheet", () => {
  const sheet = (patch: Partial<ComponentProps<typeof InvoiceSheet>> = {}) =>
    html(
      createElement(InvoiceSheet, {
        quoteId: "q1",
        invoice: null,
        clientEmail: "sam@example.invalid",
        firstName: "Sam",
        total: 4830,
        currency: "NZD",
        blockers: [],
        onSent: noop,
        onClose: noop,
        ...patch,
      }),
    );
  const confirm = (markup: string) => tag(markup, 'data-testid="job-invoice-confirm"');

  it("makes and emails the invoice to the client", () => {
    const out = sheet();
    expect(out).toContain("Send the invoice to Sam");
    expect(out).toContain("to sam@example.invalid");
    expect(out).toContain("$4,830.00");
    expect(confirm(out)).not.toContain("disabled");
  });

  it("sends an existing draft", () => {
    expect(sheet({ invoice: invoice("draft") })).toContain("INV-0012 is made but not sent yet.");
  });

  it("can't make one while the quote can't be invoiced", () => {
    const out = sheet({ blockers: ["Quote total is 0 — set prices on the line items."] });
    expect(out).toContain("This can&#x27;t be invoiced yet");
    expect(confirm(out)).toContain("disabled");
  });

  it("with no email address: make it, then hand over the PDF", () => {
    expect(sheet({ clientEmail: null })).toContain("Make the invoice");
    const made = sheet({ clientEmail: null, invoice: invoice("draft") });
    expect(made).toContain("Send it yourself");
    expect(made).toContain("Download the invoice PDF");
    expect(made).not.toContain("job-invoice-confirm");
  });
});
