"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth/friendlyAuthError";
import { currentPasswordRequired, verifyCurrentPassword } from "@/lib/auth/password-change";
import { allowSignInAttempt, SIGNIN_TOO_MANY_MESSAGE } from "@/lib/auth/signin-throttle";
import { requestIp } from "@/lib/request-ip";

const back = (message: string) => `/reset-password?error=${encodeURIComponent(message)}`;

/**
 * Set a new password. Allowed straight away only for a password-recovery
 * session (the forgot-password email link, within the hour) or a sign-in
 * from the last few minutes; any other session must give the current
 * password too, so a stolen session or an unlocked phone can't lock the
 * owner out for good. See src/lib/auth/password-change.ts.
 */
export async function resetPasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const current = String(formData.get("current_password") ?? "");

  if (!password || password.length < 8) {
    redirect("/reset-password?error=Password%20must%20be%20at%20least%208%20characters");
  }

  if (password !== confirm) {
    redirect("/reset-password?error=Passwords%20do%20not%20match");
  }

  const supabase = await createClient();
  // Verified claims of this session (signature checked, or GoTrue asked).
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) {
    redirect(
      "/forgot-password?error=Reset%20link%20expired%20or%20invalid.%20Request%20a%20new%20one.",
    );
  }

  if (currentPasswordRequired(claims.amr)) {
    if (!current) redirect(back("Enter your current password to set a new one."));
    const email = typeof claims.email === "string" && claims.email ? claims.email : null;
    if (!email) redirect(back("We couldn't check your current password. Use Forgot password instead."));
    // Checking the current password is a sign-in attempt: same throttle.
    if (!allowSignInAttempt({ ip: requestIp({ headers: await headers() }), email })) {
      redirect(back(SIGNIN_TOO_MANY_MESSAGE));
    }
    const check = await verifyCurrentPassword({ email, password: current, userId: claims.sub });
    if (check === "wrong") redirect(back("That current password isn't right. Try again, or use Forgot password."));
    if (check !== "ok") redirect(back("We couldn't check your current password. Try again in a minute."));
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(back(friendlyAuthError(error.message, "reset")));
  }

  redirect("/app");
}
