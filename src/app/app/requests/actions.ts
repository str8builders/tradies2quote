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
  // Restoring must not invent progress: a request whose draft never got line
  // items goes back to "generation_failed" so the Generate button returns.
  let status: "dismissed" | "generated" | "generation_failed" = "dismissed";
  if (!dismissed) {
    const { data: row } = await supabase.from("quote_requests").select("quote_id").eq("id", id).eq("user_id", user.id).maybeSingle();
    const { data: quote } = row?.quote_id
      ? await supabase.from("quotes").select("quote_data").eq("id", row.quote_id).eq("user_id", user.id).maybeSingle()
      : { data: null };
    const hasLines = Array.isArray((quote?.quote_data as { line_items?: unknown } | null)?.line_items);
    status = hasLines ? "generated" : "generation_failed";
  }
  const { error } = await supabase
    .from("quote_requests")
    .update({ status })
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
