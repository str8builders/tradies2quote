import "server-only";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * Trial / onboarding email orchestrator.
 *
 * Pure logic + one Resend send wrapper. The cron route at
 * /api/cron/trial-emails is the only caller.
 *
 * Five email kinds, all keyed off `auth.users.created_at` (= trial start).
 * The 7-day trial length is fixed per the build spec; if/when Stripe lands,
 * paying users skip the expiry branch.
 *
 *   onboarding_24h   — 24h after signup, zero quotes sent
 *   onboarding_3day  — 3 days after signup, zero quotes sent (Calendly CTA)
 *   trial_minus_2    — 5 days after signup (T-2)
 *   trial_day_0      — 7 days after signup (T)
 *   trial_plus_3     — 10 days after signup (T+3)
 *
 * Vercel Hobby caps cron at once-per-day, so the scheduler runs daily.
 * `kindForUser` returns the MOST-RECENT kind the user qualifies for; the
 * dedup ledger (`lifecycle_emails` unique on user_id+kind) makes the job
 * idempotent so re-runs and missed-day catch-ups never double-send. A user
 * who sits in the 24h-to-3day band for two days only ever gets the
 * onboarding_24h email once.
 */

const RESEND_URL = "https://api.resend.com/emails";
const TRIAL_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type EmailKind =
  | "onboarding_24h"
  | "onboarding_3day"
  | "trial_minus_2"
  | "trial_day_0"
  | "trial_plus_3";

export const EMAIL_KINDS: readonly EmailKind[] = [
  "onboarding_24h",
  "onboarding_3day",
  "trial_minus_2",
  "trial_day_0",
  "trial_plus_3",
] as const;

/**
 * How many hours after signup each email becomes eligible to send.
 * A user is "in band" for a kind from this hour onwards until the NEXT
 * kind's threshold opens — the dedup ledger then guarantees at-most-
 * once delivery across the entire band.
 */
const KIND_THRESHOLD_HOURS: Record<EmailKind, number> = {
  onboarding_24h: 24,
  onboarding_3day: 3 * 24,
  trial_minus_2: (TRIAL_DAYS - 2) * 24,
  trial_day_0: TRIAL_DAYS * 24,
  trial_plus_3: (TRIAL_DAYS + 3) * 24,
};

/** Kinds gated by "tradie has not yet sent any quote". */
const REQUIRES_ZERO_SENT: ReadonlySet<EmailKind> = new Set([
  "onboarding_24h",
  "onboarding_3day",
]);

export function requiresZeroSentQuotes(kind: EmailKind): boolean {
  return REQUIRES_ZERO_SENT.has(kind);
}

/**
 * Returns the most-recent EmailKind the user qualifies for, or null if
 * they're younger than 24h. The caller is expected to consult the dedup
 * ledger and skip if this kind was already sent — meaning users only
 * ever receive each kind once across the entire eligibility band.
 *
 * Picking "most recent" matters for resilience: if the daily cron is
 * down for a couple of days, a user who skipped the 24h slot still gets
 * their most-relevant message on the next successful run, instead of
 * being pinned to an outdated onboarding nudge.
 *
 * `now` is injected so tests don't depend on wall clock.
 */
export function kindForUser(
  signedUpAt: Date,
  now: Date = new Date(),
): EmailKind | null {
  const elapsedHours = (now.getTime() - signedUpAt.getTime()) / HOUR_MS;
  // Walk the kinds in reverse so the latest-eligible threshold wins.
  for (let i = EMAIL_KINDS.length - 1; i >= 0; i--) {
    const kind = EMAIL_KINDS[i];
    if (elapsedHours >= KIND_THRESHOLD_HOURS[kind]) {
      return kind;
    }
  }
  return null;
}

type TemplateArgs = {
  firstName: string;
  appUrl: string;
  /** Optional — leave unset to omit the video CTA from the 24h email. */
  videoUrl?: string;
  /** Optional — leave unset to omit the Calendly CTA from the 3-day email. */
  calendlyUrl?: string;
  /** Trial-end date as a localized string, e.g. "Sun 24 May". */
  trialEndsLabel: string;
};

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderEmail(kind: EmailKind, args: TemplateArgs): RenderedEmail {
  switch (kind) {
    case "onboarding_24h":
      return renderOnboarding24h(args);
    case "onboarding_3day":
      return renderOnboarding3day(args);
    case "trial_minus_2":
      return renderTrialMinus2(args);
    case "trial_day_0":
      return renderTrialDay0(args);
    case "trial_plus_3":
      return renderTrialPlus3(args);
  }
}

function shell(inner: string): string {
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111; line-height: 1.5;">
${inner}
<p style="color: #666; font-size: 12px; margin-top: 32px;">— Challis at tradies2Quote<br><a href="https://tradies2quote.com" style="color: #FF5F15;">tradies2quote.com</a></p>
</body></html>`;
}

function btn(href: string, label: string): string {
  return `<p style="margin: 24px 0;">
  <a href="${href}" style="display: inline-block; background: #FF5F15; color: #111; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 4px;">${label}</a>
</p>`;
}

function renderOnboarding24h(args: TemplateArgs): RenderedEmail {
  const subject = "Record your first quote in 60 seconds";
  const newQuoteUrl = `${args.appUrl}/app/quotes/new`;
  const videoLine = args.videoUrl
    ? `\n\nWant a 60-second walkthrough first? ${args.videoUrl}`
    : "";
  const text = `Hi ${args.firstName},

You signed up yesterday but haven't recorded a quote yet. The hardest part is the first one — pick a job you'd quote today, tap the mic, and just talk.

Most tradies get a usable quote on their first try, then tweak the lines.

Start here: ${newQuoteUrl}${videoLine}

Cheers,
Challis (tradies2Quote)`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>You signed up yesterday but haven't recorded a quote yet. The hardest part is the first one — pick a job you'd quote today, tap the mic, and just talk.</p>
<p>Most tradies get a usable quote on their first try, then tweak the lines.</p>
${btn(newQuoteUrl, "Record your first quote")}
${args.videoUrl ? `<p style="color: #666; font-size: 13px;">Prefer a 60-sec walkthrough first? <a href="${args.videoUrl}" style="color: #FF5F15;">Watch the demo</a>.</p>` : ""}
<p>Cheers,<br>Challis (tradies2Quote)</p>
`);
  return { subject, text, html };
}

function renderOnboarding3day(args: TemplateArgs): RenderedEmail {
  const subject = "Want 15 minutes with the builder who made this?";
  const newQuoteUrl = `${args.appUrl}/app/quotes/new`;
  const callLine = args.calendlyUrl
    ? `\n\nGrab a 15-min slot: ${args.calendlyUrl}`
    : "\n\nReply to this email and we'll find a time.";
  const text = `Hi ${args.firstName},

Three days in and still no quote on the system. That usually means one of three things — voice flow felt off, the editor is fiddly, or there's a job type the AI's not nailing.

I'm a working builder based in Tauranga, I built this thing for me, and I'll spend 15 min with you 1-on-1 to figure out the blocker.${callLine}

Or just open a quote and email back if something looks wrong: ${newQuoteUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Three days in and still no quote on the system. That usually means one of three things — voice flow felt off, the editor is fiddly, or there's a job type the AI's not nailing.</p>
<p>I'm a working builder based in Tauranga, I built this thing for me, and I'll spend 15 min with you 1-on-1 to figure out the blocker.</p>
${args.calendlyUrl ? btn(args.calendlyUrl, "Grab a 15-min slot") : '<p>Just reply to this email and we\'ll find a time.</p>'}
<p style="color: #666; font-size: 13px;">Or just open a quote and email back if something looks wrong: <a href="${newQuoteUrl}" style="color: #FF5F15;">${newQuoteUrl}</a></p>
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderTrialMinus2(args: TemplateArgs): RenderedEmail {
  const subject = "Your trial ends in 2 days";
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Heads up — your 7-day trial ends on ${args.trialEndsLabel}. No card on file so nothing auto-charges.

If you're getting value, the cheapest plan is $49/mo and unlocks unlimited quotes. If not, no drama, your account just goes read-only after the trial ends — you can still log in and grab any PDFs you sent.

Manage your account: ${settingsUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Heads up — your 7-day trial ends on <strong>${escapeHtml(args.trialEndsLabel)}</strong>. No card on file so nothing auto-charges.</p>
<p>If you're getting value, the cheapest plan is $49/mo and unlocks unlimited quotes. If not, no drama, your account just goes read-only after the trial ends — you can still log in and grab any PDFs you sent.</p>
${btn(settingsUrl, "Manage your account")}
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderTrialDay0(args: TemplateArgs): RenderedEmail {
  const subject = "Your trial ends today";
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Today's the last day of your free trial. After tonight your account flips to read-only — quotes you've already sent keep working, but you can't make new ones until you upgrade.

If you've been on the fence, $49/mo is the easy answer. Click below to pick a plan.

${settingsUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Today's the last day of your free trial. After tonight your account flips to read-only — quotes you've already sent keep working, but you can't make new ones until you upgrade.</p>
<p>If you've been on the fence, <strong>$49/mo</strong> is the easy answer. Pick a plan below.</p>
${btn(settingsUrl, "Upgrade now")}
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderTrialPlus3(args: TemplateArgs): RenderedEmail {
  const subject = "We left the door open";
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Your trial ended three days ago. Your quotes are still saved and your account is right where you left it — you just can't make new ones without a plan.

If now's not the time, no worries. If you want to give it another go, $49/mo unlocks everything: ${settingsUrl}

Either way, hit reply if there's something I can fix.

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Your trial ended three days ago. Your quotes are still saved and your account is right where you left it — you just can't make new ones without a plan.</p>
<p>If now's not the time, no worries. If you want to give it another go, $49/mo unlocks everything.</p>
${btn(settingsUrl, "Reactivate")}
<p style="color: #666; font-size: 13px;">Either way, hit reply if there's something I can fix.</p>
<p>— Challis</p>
`);
  return { subject, text, html };
}

export function trialEndsLabel(signedUpAt: Date): string {
  const end = new Date(signedUpAt.getTime() + TRIAL_DAYS * DAY_MS);
  // Day-of-week + short date, e.g. "Sun 24 May". en-NZ matches the
  // primary market; tradies elsewhere see the same compact format.
  return end.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Pacific/Auckland",
  });
}

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

export async function sendTrialEmail(args: {
  to: string;
  rendered: RenderedEmail;
  idempotencyKey: string;
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
      "Idempotency-Key": args.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.rendered.subject,
      text: args.rendered.text,
      html: args.rendered.html,
    }),
  }, TIMEOUTS.email);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Resend (trial email) error", res.status, detail);
    return { ok: false, error: `email_send_failed_${res.status}` };
  }
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  return { ok: true, messageId: data?.id ?? null };
}

export function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  // "challis.samu" -> "Challis", "j_doe" -> "J"
  const first = local.split(/[.\-_]/)[0] ?? local;
  if (!first) return "there";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
