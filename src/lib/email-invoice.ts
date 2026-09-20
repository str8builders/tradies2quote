import {renderBusinessEmail} from "./emails/business-email";
import "server-only";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

const RESEND_URL = "https://api.resend.com/emails";

type SendArgs = {
  to: string;
  businessName: string;
  clientName: string;
  total: string;
  dueDateLabel: string;
  invoiceNumber: string;
  pdf: Uint8Array;
  pdfFileName: string;
  paymentInstructions?: string | null;
  /**
   * The tradie's own address — the body says "just reply to this email",
   * but `from` is the platform's no-mailbox sending address. See the
   * matching note in email-quote.ts.
   */
  replyTo?: string | null;
};

/**
 * Invoice email sender. Sibling to `email-quote.ts` — same Resend
 * transport, same RESEND_API_KEY / RESEND_FROM_EMAIL env vars.
 * Subject line and copy are invoice-flavoured: focuses on the amount
 * due, the due date, and how to pay.
 */
export async function sendInvoiceEmail(
  args: SendArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "email_not_configured" };
  if (!from) return { ok: false, error: "email_from_not_configured" };

  const subject = `Invoice ${args.invoiceNumber} from ${args.businessName}`;
  const {html,text}=await renderBusinessEmail({kind:"invoice",businessName:args.businessName,clientName:args.clientName,number:args.invoiceNumber,total:args.total,dueDate:args.dueDateLabel,paymentInstructions:args.paymentInstructions});

  const body = {
    from,
    to: [args.to],
    ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    subject,
    text,
    html,
    attachments: [
      {
        filename: args.pdfFileName,
        content: Buffer.from(args.pdf).toString("base64"),
      },
    ],
  };

  const res = await fetchWithTimeout(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, TIMEOUTS.email);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend (invoice) error", res.status, detail);
    return { ok: false, error: `email_send_failed_${res.status}` };
  }
  return { ok: true };
}
