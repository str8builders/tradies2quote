import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendQuoteEmail } from "./email-quote";
import { sendInvoiceEmail } from "./email-invoice";

/**
 * Both email bodies invite the customer to reply. `from` is the platform's
 * sending address (quotes@tradies2quote.com) which has no mailbox, so the
 * tradie's own address MUST ride along as reply_to or every customer reply
 * is silently lost.
 */

const okResponse = () =>
  ({ ok: true, status: 200, text: async () => "", json: async () => ({}) }) as Response;

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.RESEND_API_KEY = "re_test";
  process.env.RESEND_FROM_EMAIL = "TradiesToQuote <quotes@tradies2quote.com>";
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

const sentBody = () =>
  JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);

const quoteArgs = {
  to: "customer@example.com",
  businessName: "Bayside Builders",
  clientName: "Sarah King",
  total: "$644.46",
  acceptUrl: "https://tradies2quote.com/quote/tok",
  quoteNumber: "Q-2026-0001",
  pdf: new Uint8Array([1, 2, 3]),
  pdfFileName: "Q-2026-0001.pdf",
};

const invoiceArgs = {
  to: "customer@example.com",
  businessName: "Bayside Builders",
  clientName: "Sarah King",
  total: "$644.46",
  dueDateLabel: "on receipt",
  invoiceNumber: "INV-1",
  pdf: new Uint8Array([1, 2, 3]),
  pdfFileName: "INV-1.pdf",
};

describe("quote email reply_to", () => {
  it("sends the tradie's address as reply_to so customer replies reach them", async () => {
    const res = await sendQuoteEmail({ ...quoteArgs, replyTo: "sam@baysidebuilders.co.nz" });
    expect(res.ok).toBe(true);
    expect(sentBody().reply_to).toBe("sam@baysidebuilders.co.nz");
  });

  it("omits reply_to entirely when the tradie has no profile email", async () => {
    await sendQuoteEmail({ ...quoteArgs, replyTo: null });
    expect(sentBody()).not.toHaveProperty("reply_to");
  });
});

describe("invoice email reply_to", () => {
  it("sends the tradie's address as reply_to", async () => {
    await sendInvoiceEmail({ ...invoiceArgs, replyTo: "sam@baysidebuilders.co.nz" });
    expect(sentBody().reply_to).toBe("sam@baysidebuilders.co.nz");
  });

  it("omits reply_to when absent", async () => {
    await sendInvoiceEmail({ ...invoiceArgs, replyTo: null });
    expect(sentBody()).not.toHaveProperty("reply_to");
  });
});
