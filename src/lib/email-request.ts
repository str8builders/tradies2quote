import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * "New quote request" email to the tradie. Same Resend wiring as
 * email-quote.ts: a missing key or sender is a soft no-op, never a throw.
 */
export type QuoteRequestEmailArgs = {
  to: string;
  businessName: string;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  siteAddress: string | null;
  description: string;
  quoteUrl: string;
};

export async function sendQuoteRequestEmail(
  args: QuoteRequestEmailArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "email_not_configured" };
  if (!from) return { ok: false, error: "email_from_not_configured" };

  const contact = [args.clientPhone, args.clientEmail].filter(Boolean).join(" · ");
  const html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <p style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#FF5F15;margin:0 0 8px">Tradies2Quote</p>
      <h1 style="font-size:22px;margin:0 0 16px">New quote request from ${escapeHtml(args.clientName)}</h1>
      <p style="margin:0 0 6px"><strong>Contact:</strong> ${escapeHtml(contact || "not given")}</p>
      <p style="margin:0 0 16px"><strong>Site:</strong> ${escapeHtml(args.siteAddress || "not given")}</p>
      <p style="margin:0 0 6px"><strong>What they want:</strong></p>
      <blockquote style="margin:0 0 20px;padding:12px 16px;background:#f4f4f4;border-left:4px solid #FF5F15;white-space:pre-wrap">${escapeHtml(args.description)}</blockquote>
      <p style="margin:0 0 20px">A draft quote is being prepared on your account. Review it, set your rates, and send it when you're happy.</p>
      <p><a href="${escapeHtml(args.quoteUrl)}" style="display:inline-block;background:#FF5F15;color:#111;font-weight:700;padding:12px 20px;border-radius:4px;text-decoration:none">Open the draft quote</a></p>
      <p style="font-size:12px;color:#666;margin-top:28px">You're getting this because your Tradies2Quote request link is switched on. Turn it off any time in Settings.</p>
    </div>`;

  const res = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: `New quote request from ${args.clientName}`,
        html,
        ...(args.clientEmail ? { reply_to: args.clientEmail } : {}),
      }),
    },
    TIMEOUTS.email,
  ).catch(() => null);
  if (!res) return { ok: false, error: "email_network_error" };
  if (!res.ok) return { ok: false, error: `email_send_failed_${res.status}` };
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
