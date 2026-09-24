/**
 * Plain-English wording for Supabase Auth (GoTrue) errors shown on the sign-in,
 * sign-up and password pages. GoTrue's own messages ("Invalid login
 * credentials", "Email not confirmed", "Password is known to be weak…") read
 * like system errors to a tradie; these say what happened and what to do.
 *
 * The "Email not confirmed" wording must keep the word "confirm": LoginForm
 * shows its resend-confirmation form when the banner matches /confirm/i.
 */
export type AuthErrorContext = "login" | "signup" | "reset" | "forgot";

const RULES: Array<{ test: RegExp; message: string | ((ctx: AuthErrorContext) => string) }> = [
  {
    test: /invalid login credentials|invalid_credentials/i,
    message: "That email and password don't match. Check them and try again, or reset your password.",
  },
  {
    test: /email not confirmed|email_not_confirmed/i,
    message: "Please confirm your email first. Tap the link we emailed you, or send a new one below.",
  },
  {
    test: /rate limit|only request this after|too many requests|over_(request|email_send)_rate_limit/i,
    message: "Too many tries in a short time. Wait a minute, then try again.",
  },
  {
    test: /known to be weak|easy to guess|pwned|weak_password/i,
    message: "Choose a different password. That one is too easy to guess.",
  },
  {
    test: /at least \d+ characters/i,
    message: "Your password needs at least 8 characters.",
  },
  {
    test: /different from the old password|same_password/i,
    message: "Choose a new password, not the one you already have.",
  },
  {
    test: /auth session missing|session_not_found|session.*expired/i,
    message: (ctx) =>
      ctx === "reset"
        ? "Your reset link has expired. Tap 'Forgot password' to get a new one."
        : "Your sign-in has expired. Please sign in again.",
  },
  {
    test: /signups? not allowed|signup_disabled/i,
    message: "New sign-ups are paused right now. Please try again later.",
  },
  {
    test: /unable to validate email|invalid format|email_address_invalid|invalid email/i,
    message: "That email address doesn't look right. Check it and try again.",
  },
];

const FALLBACK: Record<AuthErrorContext, string> = {
  login: "We couldn't sign you in. Please try again.",
  signup: "We couldn't create your account. Please try again.",
  reset: "We couldn't change your password. Please try again.",
  forgot: "We couldn't send the reset email. Please try again.",
};

export function friendlyAuthError(
  message: string | null | undefined,
  context: AuthErrorContext,
): string {
  const text = (message ?? "").trim();
  for (const rule of RULES) {
    if (rule.test.test(text)) {
      return typeof rule.message === "function" ? rule.message(context) : rule.message;
    }
  }
  return FALLBACK[context];
}
