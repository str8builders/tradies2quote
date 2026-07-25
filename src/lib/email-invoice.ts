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
  const text = `Hi ${args.clientName},

Here's your invoice from ${args.businessName} — ${args.total} total, due ${args.dueDateLabel}.

The full invoice PDF is attached.${args.paymentInstructions ? `

To pay: ${args.paymentInstructions}` : ""}

If anything looks off, reply to this email and we'll sort it.

— ${args.businessName}`;

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>Hi ${escapeHtml(args.clientName)},</p>
  <p>Here's your invoice from <strong>${escapeHtml(args.businessName)}</strong>.</p>
  <p style="font-size: 32px; font-weight: bold; color: #FF5F15; margin: 24px 0 4px;">${escapeHtml(args.total)}</p>
  <p style="color: #666; font-size: 13px; margin: 0 0 24px;">Due ${escapeHtml(args.dueDateLabel)}</p>
  <p>The full invoice PDF is attached.</p>
  ${
    args.paymentInstructions
      ? `<div style="margin: 24px 0; padding: 16px; background: #F5F5F0; border-left: 3px solid #FF5F15; font-size: 14px;">
    <strong style="display: block; margin-bottom: 4px;">How to pay</strong>
    ${escapeHtml(args.paymentInstructions).replace(/\n/g, "<br>")}
  </div>`
      : ""
  }
  <p style="color: #666; font-size: 13px;">If anything looks off, just reply to this email.</p>
  <p style="color: #666; font-size: 13px; margin-top: 32px;">— ${escapeHtml(args.businessName)}</p>
</body></html>`;

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
