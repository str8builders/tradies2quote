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
  const text = `Hi ${args.clientName},

Here's your quote from ${args.businessName} — ${args.total} total.

The full quote PDF is attached. To accept it, click the link below:

${args.acceptUrl}

If you have any questions, reply to this email.

— ${args.businessName}`;

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>Hi ${escapeHtml(args.clientName)},</p>
  <p>Here's your quote from <strong>${escapeHtml(args.businessName)}</strong>.</p>
  <p style="font-size: 32px; font-weight: bold; color: #FF5F15; margin: 24px 0;">${escapeHtml(args.total)}</p>
  <p>The full quote PDF is attached. Tap the button to accept online:</p>
  <p style="margin: 24px 0;">
    <a href="${args.acceptUrl}"
       style="display: inline-block; background: #FF5F15; color: #111; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 4px;">
      Accept Quote
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">If the button doesn't work, copy this link: <br>${escapeHtml(args.acceptUrl)}</p>
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
    console.error("Resend error", res.status, detail);
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
