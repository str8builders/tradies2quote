import {renderBusinessEmail} from "./emails/business-email";
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
  const {html,text}=await renderBusinessEmail({kind:"request",businessName:args.businessName,clientName:args.clientName,contact,site:args.siteAddress,description:args.description,actionUrl:args.quoteUrl});

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
        text,
        ...(args.clientEmail ? { reply_to: args.clientEmail } : {}),
      }),
    },
    TIMEOUTS.email,
  ).catch(() => null);
  if (!res) return { ok: false, error: "email_network_error" };
  if (!res.ok) return { ok: false, error: `email_send_failed_${res.status}` };
  return { ok: true };
}
