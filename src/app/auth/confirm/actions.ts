"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { captureError } from "@/lib/observability";
import { WELCOME_SEEN_COOKIE } from "@/lib/welcome-cookie";
import {
  failureRedirectFor,
  isEmailLinkType,
  parseEmailLinkParams,
} from "@/lib/auth/emailLink";

/** GoTrue's answers for a link that is simply old or already used. */
const EXPECTED_LINK_FAILURE = /expired|invalid|not found|already/i;

/**
 * Verify a reset / sign-up email link (see `src/lib/auth/emailLink.ts`).
 * Runs on the button's POST, never on the email link's GET, so link
 * scanners cannot spend the single-use token.
 */
export async function confirmEmailLinkAction(formData: FormData): Promise<void> {
  const rawType = formData.get("type");
  const params = parseEmailLinkParams({
    token_hash: formData.get("token_hash"),
    type: rawType,
    next: formData.get("next"),
  });
  if (!params) redirect(failureRedirectFor(isEmailLinkType(rawType) ? rawType : null));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: params.type,
    token_hash: params.tokenHash,
  });

  if (error) {
    // Old or reused links are routine; anything else (GoTrue down, config)
    // is reported so it shows in the error digest.
    const code = (error as { code?: string }).code ?? "";
    if (code !== "otp_expired" && !EXPECTED_LINK_FAILURE.test(error.message)) {
      captureError(error, { route: "auth/confirm" });
    }
    redirect(failureRedirectFor(params.type));
  }

  // A fresh sign-in is an entry: forget any earlier "seen" marker so /app
  // opens with the welcome, same as the OAuth/code callback.
  (await cookies()).set(WELCOME_SEEN_COOKIE, "", { maxAge: 0, path: "/" });
  redirect(params.next);
}
