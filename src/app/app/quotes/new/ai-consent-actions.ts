"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AI_CONSENT_VERSION } from "@/lib/ai-consent";

export type AiConsentResult = { ok: true } | { ok: false; error: string };

/**
 * Record the user's affirmative consent to third-party AI processing
 * (Guideline 5.1.2(i)). Stamps `ai_consent_at` = now and the disclosure
 * version agreed to, on the caller's own profile row (RLS-gated by id).
 */
export async function recordAiConsentAction(): Promise<AiConsentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        ai_consent_at: new Date().toISOString(),
        ai_consent_version: AI_CONSENT_VERSION,
      },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message || "Could not save." };

  revalidatePath("/app/quotes/new");
  revalidatePath("/app/settings");
  return { ok: true };
}

/**
 * Withdraw AI consent (Settings). Nulls both fields; the next AI action in the
 * iOS shell will re-prompt.
 */
export async function withdrawAiConsentAction(): Promise<AiConsentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { error } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, ai_consent_at: null, ai_consent_version: null },
      { onConflict: "id" },
    );
  if (error) return { ok: false, error: error.message || "Could not save." };

  revalidatePath("/app/settings");
  revalidatePath("/app/quotes/new");
  return { ok: true };
}
