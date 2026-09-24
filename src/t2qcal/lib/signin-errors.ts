import {friendlyAuthError} from "@/lib/auth/friendlyAuthError";

/**
 * T2QCAL sign-in failures travel back to the page as a short code, never as
 * free text in the URL: a crafted link cannot put its own words on the
 * sign-in screen, and every message reads like the website's own.
 */
export type SignInErrorCode="missing"|"credentials"|"unconfirmed"|"rate"|"email"|"other";

export function signInErrorCode(message:string|null|undefined):SignInErrorCode{
  const text=(message??"").trim();
  if(/invalid login credentials|invalid_credentials/i.test(text))return "credentials";
  if(/email not confirmed|email_not_confirmed/i.test(text))return "unconfirmed";
  if(/rate limit|only request this after|too many requests|over_(request|email_send)_rate_limit/i.test(text))return "rate";
  if(/unable to validate email|invalid format|email_address_invalid|invalid email/i.test(text))return "email";
  return "other";
}

/** Wording for a code; unknown codes (an old or hand-made link) show nothing. */
export function signInErrorMessage(code:string|undefined):string|null{
  switch(code){
    case "missing":return "Enter your email and password.";
    // T2QCAL has no resend form of its own; the website sign-in page does.
    case "unconfirmed":return "Please confirm your email first. Tap the link we emailed you, then sign in here. No email? Send a new one from the Tradies2Quote sign-in page.";
    case "credentials":return friendlyAuthError("Invalid login credentials","login");
    case "rate":return friendlyAuthError("rate limit","login");
    case "email":return friendlyAuthError("invalid email","login");
    case "other":return friendlyAuthError("","login");
    default:return null;
  }
}
