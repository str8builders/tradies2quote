"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isValidRequestSlug,
  slugifyBusinessName,
  withRandomSuffix,
} from "@/lib/quote-requests/slug";

export type RequestLinkResult =
  | { ok: true; slug: string | null }
  | { ok: false; error: string };

/**
 * Turn the tradie's public "Request a quote" link on. The slug comes from
 * the business name; a clash gets a short random suffix. Always reads the
 * user from the session, never from the client.
 */
export async function enableQuoteRequestLink(): Promise<RequestLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, request_slug")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.request_slug && isValidRequestSlug(profile.request_slug)) {
    return { ok: true, slug: profile.request_slug };
  }
  const base = slugifyBusinessName(profile?.business_name ?? "");
  if (!base) {
    return { ok: false, error: "Set your business name in Settings first — it becomes your link." };
  }

  const candidates = [base, withRandomSuffix(base), withRandomSuffix(base), withRandomSuffix(base)];
  for (const slug of candidates) {
    if (!isValidRequestSlug(slug)) continue;
    const { error } = await supabase
      .from("profiles")
      .update({ request_slug: slug })
      .eq("id", user.id);
    if (!error) {
      revalidatePath("/app/settings");
      return { ok: true, slug };
    }
    // 23505 = unique violation → try the next candidate.
    if (error.code !== "23505") {
      console.error("enableQuoteRequestLink update failed", error);
      return { ok: false, error: "Couldn't save the link. Please try again." };
    }
  }
  return { ok: false, error: "Couldn't find a free link name. Please try again." };
}

/**
 * Issue a NEW link (and therefore a new QR). Turning the link off and on
 * again used to hand back the identical slug, so a link printed on old
 * signage or shared somewhere it shouldn't be could never be retired.
 * The new slug always carries a random suffix, so it never repeats.
 */
export async function rotateQuoteRequestLink(): Promise<RequestLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, request_slug")
    .eq("id", user.id)
    .maybeSingle();
  const base = slugifyBusinessName(profile?.business_name ?? "");
  if (!base) {
    return { ok: false, error: "Set your business name in Settings first — it becomes your link." };
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = withRandomSuffix(base);
    if (!isValidRequestSlug(slug) || slug === profile?.request_slug) continue;
    const { error } = await supabase.from("profiles").update({ request_slug: slug }).eq("id", user.id);
    if (!error) {
      revalidatePath("/app/settings");
      return { ok: true, slug };
    }
    if (error.code !== "23505") {
      console.error("rotateQuoteRequestLink update failed", error);
      return { ok: false, error: "Couldn't reset the link. Please try again." };
    }
  }
  return { ok: false, error: "Couldn't find a free link name. Please try again." };
}

export async function disableQuoteRequestLink(): Promise<RequestLinkResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in first." };
  const { error } = await supabase
    .from("profiles")
    .update({ request_slug: null })
    .eq("id", user.id);
  if (error) {
    console.error("disableQuoteRequestLink update failed", error);
    return { ok: false, error: "Couldn't turn the link off. Please try again." };
  }
  revalidatePath("/app/settings");
  return { ok: true, slug: null };
}
