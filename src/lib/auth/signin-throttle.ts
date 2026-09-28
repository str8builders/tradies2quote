import { consumeFixedWindow } from "@/lib/rate-limit";

/**
 * Password attempts, throttled per client IP and per email address BEFORE
 * Supabase is asked. Supabase only sees the app server's own IP, so its
 * per-IP limit can't tell one person guessing passwords from everyone else
 * signing in. Same in-memory limiter as the confirmation-resend and
 * forgot-password forms (one app server behind Caddy).
 *
 * Used by the website sign-in, the T2QCAL sign-in and the current-password
 * check on the change-password page.
 */

export const SIGNIN_TOO_MANY_MESSAGE = "Too many tries. Wait a few minutes and try again.";

export const SIGNIN_WINDOW_MS = 15 * 60_000;
/** A household or crew can share an IP: roomier than the per-email limit. */
export const SIGNIN_PER_IP = 20;
export const SIGNIN_PER_EMAIL = 8;

/** Count one attempt; false once this IP or this email has had too many. */
export function allowSignInAttempt(args: { ip: string; email: string }): boolean {
  if (!consumeFixedWindow(`signin-ip:${args.ip}`, SIGNIN_PER_IP, SIGNIN_WINDOW_MS).ok) return false;
  const email = args.email.trim().toLowerCase();
  return consumeFixedWindow(`signin-email:${email}`, SIGNIN_PER_EMAIL, SIGNIN_WINDOW_MS).ok;
}
