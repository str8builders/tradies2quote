"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { friendlyAuthError } from "@/lib/auth/friendlyAuthError";

export async function resetPasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || password.length < 8) {
    redirect("/reset-password?error=Password%20must%20be%20at%20least%208%20characters");
  }

  if (password !== confirm) {
    redirect("/reset-password?error=Passwords%20do%20not%20match");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(friendlyAuthError(error.message, "reset"))}`);
  }

  redirect("/app");
}
