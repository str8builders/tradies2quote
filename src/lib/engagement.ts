import "server-only";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * Engagement senders — automated review requests + quote follow-ups.
 *
 * Distinct from `lib/agents/followup.ts`, which only generates copy-paste
 * templates the tradie sends by hand. THESE functions actually send (via
 * Resend), but ONLY from the cron, ONLY for tradies who opted in
 * (feature_settings.auto_review_enabled / auto_followup_enabled), and ONLY
 * once per quote/step (dedup via the review_requests / quote_followups
 * ledgers). Flag-gated by REVIEWS_ENABLED / FOLLOWUPS_ENABLED, both off by
 * default, so nothing sends until switched on.
 */

const RESEND_URL = "https://api.resend.com/emails";

export function reviewsEnabled(): boolean {
  return process.env.REVIEWS_ENABLED === "true";
}

export function followupsEnabled(): boolean {
  return process.env.FOLLOWUPS_ENABLED === "true";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim() : "";
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

/**
 * The address a quote was actually emailed to: the newest "sent" event from
 * the email path (/api/quotes/[id]/send records `metadata.to`). SMS sends
 * carry a channel and a phone number, so they're skipped. `events` newest first.
 */
export function sentToAddress(events: ReadonlyArray<{ metadata: unknown }>): string | null {
  for (const event of events) {
    const meta = event.metadata;
    if (!meta || typeof meta !== "object") continue;
    const { to, channel } = meta as { to?: unknown; channel?: unknown };
    if (channel !== undefined && channel !== null && channel !== "email") continue;
    const email = validEmail(to);
    if (email) return email;
  }
  return null;
}

/**
 * Who a follow-up or review request goes to: the address the quote was sent
 * to, else the email written on the quote itself (a quote only ever texted,
 * or an older send without the event). NEVER the client record linked by
 * quotes.client_id: the public request form links that loosely, so it can
 * be someone else, who would then get this quote's link.
 */
export function engagementRecipient(
  events: ReadonlyArray<{ metadata: unknown }>,
  quoteClient: { email?: unknown; contact?: unknown },
): string | null {
  // Same rule as the send route: the email field, else a legacy contact
  // field that holds an email.
  return sentToAddress(events) ?? validEmail(quoteClient.email) ?? validEmail(quoteClient.contact);
}

/** Replies reach the tradie (the platform's sending address has no mailbox). */
export function replyToFor(businessEmail: unknown): string | null {
  return validEmail(businessEmail);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type SendResult = { ok: true; messageId: string | null } | { ok: false; error: string };

async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** The tradie's business email, so the client's reply reaches them. */
  replyTo?: string | null;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey) return { ok: false, error: "email_not_configured" };
  if (!from) return { ok: false, error: "email_from_not_configured" };

  const res = await fetchWithTimeout(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      subject: args.subject,
      text: args.text,
      html: args.html,
    }),
  }, TIMEOUTS.email);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, error: `email_send_failed_${res.status}:${detail.slice(0, 120)}` };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, messageId: data.id ?? null };
}

/** Post-job "leave us a review" email with the tradie's Google review link. */
export async function sendReviewRequestEmail(args: {
  to: string;
  clientName: string;
  businessName: string;
  reviewUrl: string;
  replyTo?: string | null;
}): Promise<SendResult> {
  const subject = `Thanks from ${args.businessName} — quick favour?`;
  const text = `Hi ${args.clientName},

Thanks for choosing ${args.businessName}! If you were happy with the work, a
quick review would mean a lot and helps other locals find us:

${args.reviewUrl}

Cheers,
${args.businessName}`;

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>Hi ${escapeHtml(args.clientName)},</p>
  <p>Thanks for choosing <strong>${escapeHtml(args.businessName)}</strong>! If you were happy with the work, a quick review would mean a lot and helps other locals find us.</p>
  <p style="margin: 24px 0;">
    <a href="${encodeURI(args.reviewUrl)}"
       style="display: inline-block; background: #FF5F15; color: #111; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 4px;">
      Leave a review
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">If the button doesn't work, copy this link:<br>${escapeHtml(args.reviewUrl)}</p>
  <p style="color: #666; font-size: 13px; margin-top: 32px;">— ${escapeHtml(args.businessName)}</p>
</body></html>`;

  return sendEmail({ to: args.to, subject, text, html, replyTo: args.replyTo });
}

/** Gentle "just checking you got the quote" nudge with the accept link. */
export async function sendFollowupEmail(args: {
  to: string;
  clientName: string;
  businessName: string;
  quoteNumber: string;
  total: string;
  acceptUrl: string;
  step: number;
  replyTo?: string | null;
}): Promise<SendResult> {
  const subject =
    args.step >= 2
      ? `Still keen? Your quote from ${args.businessName}`
      : `Just checking — your quote from ${args.businessName}`;
  const text = `Hi ${args.clientName},

Just checking you got quote ${args.quoteNumber} (${args.total}) from ${args.businessName}.
Happy to tweak anything if you've got questions — you can review and accept it here:

${args.acceptUrl}

Cheers,
${args.businessName}`;

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <p>Hi ${escapeHtml(args.clientName)},</p>
  <p>Just checking you got quote <strong>${escapeHtml(args.quoteNumber)}</strong> (${escapeHtml(args.total)}) from <strong>${escapeHtml(args.businessName)}</strong>. Happy to tweak anything if you've got questions.</p>
  <p style="margin: 24px 0;">
    <a href="${args.acceptUrl}"
       style="display: inline-block; background: #FF5F15; color: #111; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 4px;">
      Review &amp; accept
    </a>
  </p>
  <p style="color: #666; font-size: 13px;">If the button doesn't work, copy this link:<br>${escapeHtml(args.acceptUrl)}</p>
  <p style="color: #666; font-size: 13px; margin-top: 32px;">— ${escapeHtml(args.businessName)}</p>
</body></html>`;

  return sendEmail({ to: args.to, subject, text, html, replyTo: args.replyTo });
}
