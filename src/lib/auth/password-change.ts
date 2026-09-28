import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Who may set a new password without typing the current one.
 *
 * /reset-password used to change the password for ANY signed-in session, so
 * a stolen session or an unlocked phone meant a permanent takeover. Now the
 * current password is needed unless the session is:
 *   - a password-recovery session (the forgot-password email link), used
 *     within the last hour; or
 *   - a sign-in from the last 10 minutes.
 * Both come from the access token's `amr` claim (authentication methods and
 * when each was used), which GoTrue signs and never updates on refresh.
 */

/** A reset link opened within the last hour (GoTrue's own link lifetime). */
export const RECOVERY_WINDOW_S = 60 * 60;
/** "Just signed in". */
export const FRESH_SIGN_IN_WINDOW_S = 10 * 60;

/** Methods that prove the person just signed in (not a token refresh). */
const SIGN_IN_METHODS = new Set(["password", "otp", "magiclink", "oauth", "email/signup", "invite", "sso/saml"]);

export type PasswordChangeAllowance = "recovery" | "fresh_sign_in" | null;

/**
 * Why the current password isn't needed, or null when it is. Entries
 * without a timestamp (a custom access-token hook's plain strings) prove
 * nothing about when, so they don't count.
 */
export function passwordChangeAllowance(amr: unknown, nowSeconds: number): PasswordChangeAllowance {
  if (!Array.isArray(amr)) return null;
  let allowance: PasswordChangeAllowance = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    if (typeof method !== "string" || typeof timestamp !== "number") continue;
    const age = nowSeconds - timestamp;
    if (age < -60) continue; // from the future (beyond clock skew): ignore
    if (method === "recovery" && age <= RECOVERY_WINDOW_S) return "recovery";
    if (SIGN_IN_METHODS.has(method) && age <= FRESH_SIGN_IN_WINDOW_S) allowance = "fresh_sign_in";
  }
  return allowance;
}

/** Whether this session must also give the current password to set a new one. */
export function currentPasswordRequired(amr: unknown, nowSeconds: number = Math.floor(Date.now() / 1000)): boolean {
  return passwordChangeAllowance(amr, nowSeconds) === null;
}

export type PasswordCheck = "ok" | "wrong" | "unavailable";

/**
 * Check the current password WITHOUT touching the tradie's own session: a
 * throwaway client (no cookies, nothing persisted) signs in, then signs
 * that one new session straight back out (scope "local": only it).
 */
export async function verifyCurrentPassword(args: {
  email: string;
  password: string;
  userId: string;
}): Promise<PasswordCheck> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "unavailable";
  const verifier = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await verifier.auth.signInWithPassword({ email: args.email, password: args.password });
  if (error) {
    const code = (error as { code?: string }).code ?? "";
    return code === "invalid_credentials" || /invalid login credentials/i.test(error.message) ? "wrong" : "unavailable";
  }
  const matches = data.user?.id === args.userId;
  await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  return matches ? "ok" : "wrong";
}
