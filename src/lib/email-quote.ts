import {renderBusinessEmail} from "./emails/business-email";
import "server-only";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

const RESEND_URL = "https://api.resend.com/emails";

type SendArgs = {
  to: string;
  businessName: string;
  clientName: string;
  total: string;
  acceptUrl: string;
  quoteNumber: string;
  pdf: Uint8Array;
  pdfFileName: string;
  /**
   * The tradie's own address. The body invites the customer to "reply to
   * this email", but `from` is the platform's no-mailbox sending address
   * — without this, every customer reply is silently lost. Omitted only
   * when the tradie has no email on their profile.
   */
  replyTo?: string | null;
};

export async function sendQuoteEmail(args: SendArgs): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "email_not_configured" };
  if (!from) return { ok: false, error: "email_from_not_configured" };

  const subject = `Quote ${args.quoteNumber} from ${args.businessName}`;
  const {html,text}=await renderBusinessEmail({kind:"quote",businessName:args.businessName,clientName:args.clientName,number:args.quoteNumber,total:args.total,actionUrl:args.acceptUrl});

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
    console.error("Resend error", res.status, detail);
    return { ok: false, error: `email_send_failed_${res.status}` };
  }
  return { ok: true };
}
