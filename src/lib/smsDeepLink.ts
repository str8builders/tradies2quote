/**
 * Device SMS deep-link helpers — the NZ send path.
 *
 * WHY THIS EXISTS (2026-07-17): Twilio cannot originate SMS to New
 * Zealand mobiles for an app like this. Per Twilio's own NZ guidelines,
 * alphanumeric sender IDs are "Not Supported" by NZ operators (every
 * send returns error 21612), and Twilio does not offer NZ *domestic*
 * long codes either — only an international (+1) long code, which lands
 * a foreign number on a homeowner's phone next to a payment link, or a
 * dedicated short code (5–6 weeks, enterprise pricing).
 *
 * So the quote text is composed server-side and handed to the tradie's
 * OWN Messages app. It sends from their real mobile number, which the
 * client already knows and can reply to — strictly better than a
 * platform number even where Twilio does work.
 *
 * The platform (Twilio) path is retained in /api/quotes/[id]/sms for
 * markets where it is viable; it activates only when TWILIO_* are set.
 */

/**
 * Build an `sms:` URI that opens the Messages app pre-filled.
 *
 * Separator quirk: iOS expects `&body=`, Android expects `?body=`.
 * `?&body=` is the long-standing form both parse correctly — iOS treats
 * the `?` as part of the (empty) address terminator and reads `&body`,
 * Android reads `?body` and ignores the stray `&`.
 *
 * `to` must already be E.164 (validateQuoteForSmsSending normalises it).
 */
export function buildSmsHref(to: string, body: string): string {
  return `sms:${to}?&body=${encodeURIComponent(body)}`;
}

/**
 * Can this device plausibly hand off to a Messages app?
 *
 * Desktop browsers have no SMS app, so the Text affordance is hidden
 * there rather than opening a dead scheme. UA sniffing is the pragmatic
 * signal — there is no feature test for "an sms: handler exists", and
 * this only decides whether to SHOW a button.
 */
export function deviceCanSendSms(): boolean {
  if (typeof navigator === "undefined") return false;
  const cap = (
    globalThis as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}
