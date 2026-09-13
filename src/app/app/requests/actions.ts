"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Dismiss / restore a client request. The draft quote it created is left
 * alone (it lives in Quotes like any other draft); dismissing only takes the
 * request off the list and out of the "requests waiting" count.
 */
export async function setQuoteRequestDismissed(id: string, dismissed: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown request." };
  const { error } = await supabase
    .from("quote_requests")
    .update({ status: dismissed ? "dismissed" : "generated" })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) {
    console.error("setQuoteRequestDismissed failed", error);
    return { ok: false, error: dismissed ? "Couldn't dismiss that request." : "Couldn't restore that request." };
  }
  revalidatePath("/app/requests");
  revalidatePath("/app");
  return { ok: true };
}
