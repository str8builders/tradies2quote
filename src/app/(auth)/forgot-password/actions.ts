"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { consumeFixedWindow } from "@/lib/rate-limit";

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/forgot-password?error=Email%20required");
  }

  // Same guard as the confirmation resend: 3 emails per address per 15 minutes,
  // answered with the neutral message either way so addresses can't be probed.
  const neutral = "/forgot-password?message=If%20that%20email%20exists%2C%20a%20reset%20link%20is%20on%20its%20way.";
  if (!consumeFixedWindow(`forgot-password:${email.toLowerCase()}`, 3, 15 * 60_000).ok) redirect(neutral);

  const headerStore = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    `${headerStore.get("x-forwarded-proto") ?? "http"}://${headerStore.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect(neutral);
}
