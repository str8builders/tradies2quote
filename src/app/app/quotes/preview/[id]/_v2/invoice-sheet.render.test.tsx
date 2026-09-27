// The invoice sheet: make the invoice and email it, or make it without
// emailing it and hand over the PDF for the tradie to send themselves (the
// create_invoice_from_quote action only ever makes a draft; only the send
// route emails). Rendered to static HTML in node, one state at a time.
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({ createInvoiceFromQuote: vi.fn(), markInvoiceSentByHand: vi.fn() }));

import { markupRuleBreaks } from "@/test/design-rules";
import { InvoiceSheet, InvoiceSheetView, type InvoiceSheetViewProps } from "./sheets/InvoiceSheet";
import type { JobInvoice } from "./types";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const noop = () => {};
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const DRAFT: JobInvoice = {
  id: "inv-1",
  number: "INV-0012",
  status: "draft",
  total: 4830,
  currency: "NZD",
  dueOn: "2 Oct",
  daysLate: 0,
  paidOn: null,
};

const view = (patch: Partial<InvoiceSheetViewProps> = {}) =>
  html(
    createElement(InvoiceSheetView, {
      invoice: null,
      invoiceId: null,
      clientEmail: "sam@example.invalid",
      firstName: "Sam",
      total: 4830,
      currency: "NZD",
      blockers: [],
      selfSend: false,
      busy: null,
      error: null,
      onSend: noop,
      onMake: noop,
      onMarkSent: noop,
      onClose: noop,
      ...patch,
    }),
  );
const confirm = (markup: string) => tag(markup, 'data-testid="job-invoice-confirm"');
const self = (markup: string) => tag(markup, 'data-testid="job-invoice-self"');

describe("invoice sheet: email it, or make it and send it yourself", () => {
  const out = view();

  it("'Send invoice' stays the main button, at the thumb", () => {
    expect(out).toContain("Send the invoice to Sam");
    expect(out).toContain("Due 7 days after you send it.");
    expect(out).toContain("to sam@example.invalid");
    expect(confirm(out)).toContain('data-variant="primary"');
    expect(confirm(out)).not.toContain("disabled");
    expect(out.indexOf('data-testid="job-invoice-self"')).toBeLessThan(out.indexOf('data-testid="job-invoice-confirm"'));
  });

  it("a second button makes it without emailing it", () => {
    expect(self(out)).toContain('data-variant="secondary"');
    expect(self(out)).not.toContain("disabled");
    expect(out).toContain("Make it, I&#x27;ll send it myself");
  });

  it("an invoice already made: the same choice, nothing to make", () => {
    const made = view({ invoice: DRAFT, invoiceId: DRAFT.id });
    expect(made).toContain("INV-0012 is made but not sent yet.");
    expect(made).toContain("I&#x27;ll send it myself");
    expect(made).not.toContain("Make it,");
    expect(markupRuleBreaks(made)).toEqual([]);
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("invoice sheet: working, blocked, failed", () => {
  it("making it: that button spins with 'Making it…', the other waits", () => {
    const out = view({ busy: "make" });
    expect(self(out)).toContain('aria-busy="true"');
    expect(out).toContain("Making it…");
    expect(confirm(out)).toContain("disabled");
    expect(confirm(out)).not.toContain("aria-busy");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("emailing it: 'Sending…', and no making meanwhile", () => {
    const out = view({ busy: "send" });
    expect(confirm(out)).toContain('aria-busy="true"');
    expect(out).toContain("Sending…");
    expect(self(out)).toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("can't be invoiced yet: neither button works", () => {
    const out = view({ blockers: ["Quote total is 0 — set prices on the line items."] });
    expect(out).toContain("This can&#x27;t be invoiced yet");
    expect(confirm(out)).toContain("disabled");
    expect(self(out)).toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a failure says so, with both buttons ready to try again", () => {
    const out = view({ error: "No connection. Check your signal and try again." });
    expect(tag(out, 'role="alert"')).toBe('<div role="alert">');
    expect(out).toContain("No connection. Check your signal and try again.");
    expect(confirm(out)).not.toContain("disabled");
    expect(self(out)).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("invoice sheet: handing over the PDF", () => {
  it("made to send yourself: says nothing was emailed, and hands over the PDF", () => {
    const out = view({ invoice: DRAFT, invoiceId: DRAFT.id, selfSend: true });
    expect(out).toContain("Send it yourself");
    expect(out).toContain("It&#x27;s made. We haven&#x27;t emailed it to Sam.");
    expect(out).toContain("on INV-0012");
    expect(out).toContain("Download the invoice PDF");
    expect(out).toContain("Mark it paid when the money&#x27;s in.");
    expect(out).not.toContain("job-invoice-confirm");
    expect(out).not.toContain("job-invoice-self");
    expect(tag(out, 'data-testid="job-invoice-done"')).not.toContain("disabled");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("made in this sheet, before the refresh brings its number: the quote total", () => {
    const out = view({ invoiceId: "inv-new", selfSend: true, total: 1680 });
    expect(out).toContain("$1,680.00");
    expect(out).not.toContain(" on INV-");
    expect(out).toContain("Download the invoice PDF");
  });

  it("no email address: one button makes it, then the PDF (no second choice)", () => {
    const ask = view({ clientEmail: null });
    expect(ask).toContain("Make the invoice");
    expect(ask).toContain("There&#x27;s no email address for Sam");
    expect(ask).not.toContain("job-invoice-self");
    expect(confirm(ask)).toContain('data-variant="primary"');
    expect(markupRuleBreaks(ask)).toEqual([]);
    const made = view({ clientEmail: "  ", invoice: DRAFT, invoiceId: DRAFT.id });
    expect(made).toContain("There&#x27;s no email address for Sam on this job.");
    expect(made).toContain("Download the invoice PDF");
    expect(markupRuleBreaks(made)).toEqual([]);
  });
});

describe("InvoiceSheet", () => {
  it("opens on the choice for the job's invoice", () => {
    const props = {
      quoteId: "q1",
      invoice: DRAFT,
      clientEmail: "sam@example.invalid",
      firstName: "Sam",
      total: 4830,
      currency: "NZD",
      blockers: [],
      onSent: noop,
      onClose: noop,
    };
    expect(html(createElement(InvoiceSheet, props))).toBe(view({ invoice: DRAFT, invoiceId: DRAFT.id }));
    expect(html(createElement(InvoiceSheet, { ...props, invoice: null }))).toBe(view());
  });
});

describe("invoice sheet: sent it yourself? say so", () => {
  const buttons = (markup: string) =>
    [...markup.matchAll(/<button[^>]*>(?:(?!<\/button>).)*<\/button>/g)].map((m) => m[0].replace(/<[^>]*>/g, "").trim());

  it("a made invoice to send by hand: I've sent it records it, Not yet keeps it a draft", () => {
    const out = view({ invoiceId: "inv-1", selfSend: true });
    expect(out).toContain('data-testid="job-invoice-sent-by-hand"');
    expect(buttons(out).join(" | ")).toMatch(/I(&#x27;|')ve sent it \| Not yet/);
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("no email address: the same", () => {
    expect(view({ invoiceId: "inv-1", clientEmail: null })).toContain('data-testid="job-invoice-sent-by-hand"');
  });

  it("already sent: just Done", () => {
    const out = view({ invoiceId: "inv-1", clientEmail: null, invoice: { ...DRAFT, status: "sent" } });
    expect(out).not.toContain("job-invoice-sent-by-hand");
    expect(tag(out, 'data-testid="job-invoice-done"')).toContain("<button");
  });

  it("while it saves, and when it can't", () => {
    expect(tag(view({ invoiceId: "inv-1", selfSend: true, busy: "mark" }), 'data-testid="job-invoice-sent-by-hand"')).toContain("aria-busy");
    const failed = view({ invoiceId: "inv-1", selfSend: true, error: "Could not mark the invoice sent." });
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Could not mark the invoice sent.");
  });
});
