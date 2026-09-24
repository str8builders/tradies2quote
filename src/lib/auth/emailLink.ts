/**
 * Email-link sign-in rules for `/auth/confirm` (password reset and sign-up
 * confirmation).
 *
 * Why this exists: the default Supabase emails link to GoTrue's /verify, which
 * hands back a PKCE `code` that can only be exchanged in the SAME browser that
 * asked for the email (the code verifier lives in that browser's cookies). A
 * tradie who requests a reset from the home-screen app on an iPhone and taps
 * the email in Gmail/Mail lands in Safari or an in-app browser without that
 * cookie, and the link fails. Our templates instead link to
 * `/auth/confirm?token_hash=…&type=…`; the server verifies the token hash
 * directly (`verifyOtp`), which works in any browser.
 *
 * The page shows one button and verifies on POST, so email link-scanners
 * (Outlook Safe Links, Mimecast, antivirus) that pre-fetch links cannot use up
 * the single-use token before the tradie taps it.
 */
import { safeNextPath } from "@/lib/safe-redirect";

/** Link types our templates send. `signup` is GoTrue's legacy name for `email`. */
export const EMAIL_LINK_TYPES = ["recovery", "email", "signup"] as const;
export type EmailLinkType = (typeof EMAIL_LINK_TYPES)[number];

export type EmailLinkParams = {
  tokenHash: string;
  type: EmailLinkType;
  next: string;
};

/**
 * GoTrue token hashes are lowercase hex (sha224, 56 chars), optionally with a
 * `pkce_` prefix when the email was requested by a PKCE client. Accept a
 * slightly wider shape so a GoTrue upgrade can't lock people out, but never
 * anything that could carry markup or a URL.
 */
const TOKEN_HASH_RE = /^(?:pkce_)?[A-Za-z0-9_-]{16,128}$/;

export function isEmailLinkType(value: unknown): value is EmailLinkType {
  return typeof value === "string" && (EMAIL_LINK_TYPES as readonly string[]).includes(value);
}

/** Where each link type goes after a successful verification. */
export function defaultNextFor(type: EmailLinkType): string {
  return type === "recovery" ? "/reset-password" : "/app?confirmed=1";
}

/**
 * Validate the query/form values. Returns null when the link is unusable
 * (missing or malformed token, unknown type) so the caller can show the
 * "link expired" path instead of calling GoTrue with junk.
 */
export function parseEmailLinkParams(input: {
  token_hash?: unknown;
  type?: unknown;
  next?: unknown;
}): EmailLinkParams | null {
  const tokenHash = typeof input.token_hash === "string" ? input.token_hash.trim() : "";
  if (!TOKEN_HASH_RE.test(tokenHash)) return null;
  if (!isEmailLinkType(input.type)) return null;
  const type = input.type;
  // A reset must land on the set-password screen whatever `next` says:
  // the recovery session exists to change the password, nothing else.
  const next =
    type === "recovery"
      ? "/reset-password"
      : safeNextPath(input.next, defaultNextFor(type));
  return { tokenHash, type, next };
}

/** Plain-English failure destinations. The login banner offers "resend" when it mentions confirming. */
export function failureRedirectFor(type: EmailLinkType | null): string {
  if (type === "recovery") {
    return (
      "/forgot-password?error=" +
      encodeURIComponent(
        "That reset link has expired or was already used. Enter your email and we'll send a new one.",
      )
    );
  }
  return (
    "/login?error=" +
    encodeURIComponent(
      "That confirmation link has expired or was already used. Enter your email below and we'll send a fresh confirmation link.",
    )
  );
}

/** Wording for the one-button page, by link type. */
export function confirmCopyFor(type: EmailLinkType): {
  title: string;
  subtitle: string;
  button: string;
} {
  if (type === "recovery") {
    return {
      title: "Set a new password",
      subtitle: "Tap the button to continue. You'll choose your new password on the next screen.",
      button: "Continue to new password",
    };
  }
  return {
    title: "Confirm your email",
    subtitle: "Tap the button to confirm your email address and open Tradies2Quote.",
    button: "Confirm my email",
  };
}
