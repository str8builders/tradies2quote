"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-redirect";
import { consumeFixedWindow } from "@/lib/rate-limit";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/app");

  if (!email || !password) {
    redirect("/login?error=Email%20and%20password%20required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(safeNextPath(next));
}

/**
 * Re-send the signup confirmation email.
 *
 * Wave 40 — previously there was NO path to re-request the confirmation
 * email: if Supabase's first email never arrived (spam filter, typo'd
 * inbox recovery, mail delay) the user was stuck at "Check your inbox"
 * forever. `LoginForm` shows a small resend form whenever the banner
 * mentions confirmation.
 *
 * Anti-abuse / anti-enumeration:
 *   - Fixed-window rate limit: 3 sends per email per 15 minutes (plus
 *     Supabase's own server-side resend throttle underneath).
 *   - Always redirects to the same neutral "sent if account exists"
 *     message — success, unknown email, and Supabase errors are
 *     indistinguishable to the caller.
 */
export async function resendConfirmationAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/login?error=Enter%20the%20email%20you%20signed%20up%20with");
  }

  const neutral =
    "/login?message=" +
    encodeURIComponent(
      "If that account exists, a fresh confirmation email is on its way. Check spam too.",
    );

  const quota = consumeFixedWindow(`resend-confirm:${email}`, 3, 15 * 60_000);
  if (!quota.ok) {
    // Same neutral message — don't leak that the address is known/limited.
    redirect(neutral);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const supabase = await createClient();
  // Errors are deliberately not surfaced (enumeration-safe); Supabase
  // no-ops for already-confirmed or unknown addresses anyway.
  await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${appUrl}/auth/callback` },
  });

  redirect(neutral);
}
