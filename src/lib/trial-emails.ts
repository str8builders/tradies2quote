import "server-only";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/fetchTimeout";

/**
 * Trial / onboarding email orchestrator.
 *
 * Pure logic + one Resend send wrapper. The cron route at
 * /api/cron/trial-emails is the only caller.
 *
 * Five email kinds, all keyed off the trial start (profiles.trial_started_at,
 * else auth.users.created_at). The 7-day trial length is fixed per the build
 * spec; paying users skip the whole lot.
 *
 *   onboarding_24h   — from 1 day in, no quote made yet
 *   onboarding_3day  — from 3 days in, no quote made yet (call offer)
 *   trial_minus_2    — from 4 days in: "your trial ends on <date>"
 *   trial_day_0      — the LAST day: the final 26 hours, only while the trial
 *                      is still running; it says exactly when it ends
 *   trial_plus_3     — from 10 days in (3 days after it ended)
 *
 * The scheduler runs once a day (09:00 NZ time), so a kind whose window opens
 * at hour H goes out at the first run after H. The last-day email's window
 * ends when the trial does: it used to open at 168 h — the very moment the
 * trial ended — so "after tonight" arrived after the account had locked.
 * `kindForUser` returns the kind whose window the user is in; the dedup ledger
 * (`lifecycle_emails` unique on user_id+kind) makes each kind at-most-once.
 */

const RESEND_URL = "https://api.resend.com/emails";
const TRIAL_DAYS = 7;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Trial dates in emails are New Zealand dates (the scheduler's zone too). */
const EMAIL_TIME_ZONE = "Pacific/Auckland";
/** Plans are priced in NZ dollars only (src/lib/plans.ts). */
const FROM_PRICE = "NZ$49 a month";

/** The emails timed from the trial start (see KIND_WINDOWS). */
export type TrialEmailKind =
  | "onboarding_24h"
  | "onboarding_3day"
  | "trial_minus_2"
  | "trial_day_0"
  | "trial_plus_3";

/** Every lifecycle email, including the one-off week-before-the-beta-ends notice. */
export type EmailKind = TrialEmailKind | "beta_ending";

export const EMAIL_KINDS: readonly TrialEmailKind[] = [
  "onboarding_24h",
  "onboarding_3day",
  "trial_minus_2",
  "trial_day_0",
  "trial_plus_3",
] as const;

/**
 * The last-day email's window: the final 26 hours of the trial. A daily run
 * lands in any 24-hour window, but two 09:00 runs are 25 hours apart when
 * daylight saving ends; 26 hours can't be skipped.
 */
const LAST_DAY_HOURS = 26;

/**
 * Hours after the trial start during which each kind may be sent
 * ([from, until)). The windows follow each other, so a user is in at most one,
 * and each is wider than the longest gap between two daily runs.
 */
const KIND_WINDOWS: Record<TrialEmailKind, { from: number; until: number }> = {
  onboarding_24h: { from: 24, until: 3 * 24 },
  onboarding_3day: { from: 3 * 24, until: 4 * 24 + 2 },
  trial_minus_2: { from: 4 * 24 + 2, until: TRIAL_DAYS * 24 - LAST_DAY_HOURS },
  // The day before: never at or after the moment the trial ends.
  trial_day_0: { from: TRIAL_DAYS * 24 - LAST_DAY_HOURS, until: TRIAL_DAYS * 24 },
  trial_plus_3: { from: (TRIAL_DAYS + 3) * 24, until: Number.POSITIVE_INFINITY },
};

/** Kinds sent only to tradies who haven't made a single quote yet. */
const REQUIRES_NO_QUOTES: ReadonlySet<EmailKind> = new Set([
  "onboarding_24h",
  "onboarding_3day",
]);

/**
 * "Haven't made a quote yet": ANY quote counts (a draft, a declined or
 * expired one, even one they have since deleted), not only sent ones.
 */
export function requiresNoQuotes(kind: EmailKind): boolean {
  return REQUIRES_NO_QUOTES.has(kind);
}

/**
 * The EmailKind whose window the user is in, or null (younger than 24h, or
 * between the trial's end and the "door open" email). The caller consults
 * the dedup ledger, so each kind goes out at most once.
 *
 * `now` is injected so tests don't depend on wall clock.
 */
export function kindForUser(
  signedUpAt: Date,
  now: Date = new Date(),
): TrialEmailKind | null {
  const elapsedHours = (now.getTime() - signedUpAt.getTime()) / HOUR_MS;
  for (const kind of EMAIL_KINDS) {
    const window = KIND_WINDOWS[kind];
    if (elapsedHours >= window.from && elapsedHours < window.until) return kind;
  }
  return null;
}

/** How long before the free beta ends its one heads-up goes out. */
export const BETA_ENDING_NOTICE_DAYS = 7;

/**
 * "beta_ending" when a tradie the free beta covers is in its final week:
 * not someone already paying, not the owner or an App Store review account,
 * and not a team member (their team owner hears about billing). The dedup
 * ledger makes it once per person.
 */
export function betaEndingKind(
  status: {
    betaFreeUntil: Date | null;
    stripeSubscriptionStatus: string | null;
    managedByTeam?: boolean;
  },
  now: Date = new Date(),
): "beta_ending" | null {
  const end = status.betaFreeUntil;
  if (!end) return null;
  const msLeft = end.getTime() - now.getTime();
  if (msLeft <= 0 || msLeft > BETA_ENDING_NOTICE_DAYS * DAY_MS) return null;
  if (status.managedByTeam) return null;
  const billing = status.stripeSubscriptionStatus;
  if (billing === "owner_bypass" || billing === "review_comp") return null;
  if (billing === "active" || billing === "trialing" || billing === "past_due") return null;
  return "beta_ending";
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
  /**
   * For the last-day email: when the trial ends, relative to the send, e.g.
   * { day: "today", time: "2:15 pm" } (NZ time). See lastDayWording().
   */
  trialEnds?: { day: string; time: string };
  /** For the beta-ending email: the beta's last day, e.g. "Fri 31 Oct". */
  betaEndsLabel?: string;
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
    case "beta_ending":
      return renderBetaEnding(args);
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
  const subject = "Make your first quote";
  const newQuoteUrl = `${args.appUrl}/app/quotes/new`;
  const videoLine = args.videoUrl
    ? `\n\nWant a quick walkthrough first? ${args.videoUrl}`
    : "";
  const text = `Hi ${args.firstName},

You haven't made a quote yet. The hardest part is the first one — pick a job you'd quote today, tap the mic, and just talk.

You can check and change every line before anything goes to a client.

Start here: ${newQuoteUrl}${videoLine}

Cheers,
Challis (tradies2Quote)`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>You haven't made a quote yet. The hardest part is the first one — pick a job you'd quote today, tap the mic, and just talk.</p>
<p>You can check and change every line before anything goes to a client.</p>
${btn(newQuoteUrl, "Make your first quote")}
${args.videoUrl ? `<p style="color: #666; font-size: 13px;">Prefer a quick walkthrough first? <a href="${args.videoUrl}" style="color: #FF5F15;">Watch the demo</a>.</p>` : ""}
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
  const subject = `Your free trial ends ${args.trialEndsLabel}`;
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Heads up — your 7-day trial ends on ${args.trialEndsLabel}. No card on file so nothing auto-charges.

If it's working for you, plans start at ${FROM_PRICE} with unlimited quotes. If not, no drama, your account just goes read-only after the trial ends — you can still log in and grab any PDFs you sent.

Manage your account: ${settingsUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Heads up — your 7-day trial ends on <strong>${escapeHtml(args.trialEndsLabel)}</strong>. No card on file so nothing auto-charges.</p>
<p>If it's working for you, plans start at ${FROM_PRICE} with unlimited quotes. If not, no drama, your account just goes read-only after the trial ends — you can still log in and grab any PDFs you sent.</p>
${btn(settingsUrl, "Manage your account")}
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderTrialDay0(args: TemplateArgs): RenderedEmail {
  const ends = args.trialEnds ?? { day: `on ${args.trialEndsLabel}`, time: "" };
  const at = ends.time ? ` at ${ends.time} (NZ time)` : "";
  const subject = `Your free trial ends ${ends.day}`;
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Your free trial ends ${ends.day}${at}. After that you can't make new quotes until you choose a plan. Quotes you've already sent keep working for your clients.

Plans start at ${FROM_PRICE}. Pick one here:

${settingsUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Your free trial ends <strong>${escapeHtml(`${ends.day}${at}`)}</strong>. After that you can't make new quotes until you choose a plan. Quotes you've already sent keep working for your clients.</p>
<p>Plans start at <strong>${FROM_PRICE}</strong>. Pick one below.</p>
${btn(settingsUrl, "Choose a plan")}
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderTrialPlus3(args: TemplateArgs): RenderedEmail {
  const subject = "We left the door open";
  const settingsUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Your trial ended three days ago. Your quotes are still saved and your account is right where you left it — you just can't make new ones without a plan.

If now's not the time, no worries. If you want to give it another go, plans start at ${FROM_PRICE}: ${settingsUrl}

Either way, hit reply if there's something I can fix.

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Your trial ended three days ago. Your quotes are still saved and your account is right where you left it — you just can't make new ones without a plan.</p>
<p>If now's not the time, no worries. If you want to give it another go, plans start at ${FROM_PRICE}.</p>
${btn(settingsUrl, "Reactivate")}
<p style="color: #666; font-size: 13px;">Either way, hit reply if there's something I can fix.</p>
<p>— Challis</p>
`);
  return { subject, text, html };
}

function renderBetaEnding(args: TemplateArgs): RenderedEmail {
  const betaEnds = args.betaEndsLabel ?? "soon";
  const subject = `The free beta ends ${args.betaEndsLabel ? `on ${betaEnds}` : "soon"}`;
  const planUrl = `${args.appUrl}/app/settings`;
  const text = `Hi ${args.firstName},

Thanks for trying Tradies2Quote in the free beta. The beta ends on ${betaEnds}.

Nothing changes that night: you get 7 more days free, until ${args.trialEndsLabel}. After that, making new quotes needs a plan (from ${FROM_PRICE}). Your quotes, invoices and clients stay yours, and quotes you've already sent keep working for your clients.

No card is on file, so nothing is charged unless you choose a plan:

${planUrl}

— Challis`;
  const html = shell(`
<p>Hi ${escapeHtml(args.firstName)},</p>
<p>Thanks for trying Tradies2Quote in the free beta. The beta ends on <strong>${escapeHtml(betaEnds)}</strong>.</p>
<p>Nothing changes that night: you get 7 more days free, until <strong>${escapeHtml(args.trialEndsLabel)}</strong>. After that, making new quotes needs a plan (from ${FROM_PRICE}). Your quotes, invoices and clients stay yours, and quotes you've already sent keep working for your clients.</p>
<p>No card is on file, so nothing is charged unless you choose a plan.</p>
${btn(planUrl, "See the plans")}
<p>— Challis</p>
`);
  return { subject, text, html };
}

/** Day-of-week + short date in NZ time, e.g. "Sun 24 May". */
export function emailDateLabel(at: Date): string {
  // en-NZ matches the primary market; tradies elsewhere see the same
  // compact format.
  return at.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: EMAIL_TIME_ZONE,
  });
}

export function trialEndsLabel(signedUpAt: Date): string {
  return emailDateLabel(new Date(signedUpAt.getTime() + TRIAL_DAYS * DAY_MS));
}

/** The NZ calendar date of an instant as [year, month, day]. */
function nzDate(at: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: EMAIL_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  return [part("year"), part("month"), part("day")];
}

/**
 * When the trial ends, in words for the last-day email sent at `now`:
 * { day: "today" | "tomorrow" | "on Sun 24 May", time: "2:15 pm" }, NZ time.
 */
export function lastDayWording(signedUpAt: Date, now: Date): { day: string; time: string } {
  const end = new Date(signedUpAt.getTime() + TRIAL_DAYS * DAY_MS);
  const time = end
    .toLocaleTimeString("en-NZ", { timeZone: EMAIL_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
  const [ey, em, ed] = nzDate(end);
  const [ny, nm, nd] = nzDate(now);
  const endDay = Date.UTC(ey, em - 1, ed);
  const today = Date.UTC(ny, nm - 1, nd);
  const day = endDay === today ? "today" : endDay - today === DAY_MS ? "tomorrow" : `on ${trialEndsLabel(signedUpAt)}`;
  return { day, time };
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
