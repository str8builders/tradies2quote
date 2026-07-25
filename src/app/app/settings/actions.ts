"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SaveSettingsState } from "./_state";

/**
 * Server action that owns the editable Settings form on `/app/settings`.
 *
 * Security model:
 *   - Always reads `auth.getUser()` server-side. Never trusts a user id
 *     coming up from the client.
 *   - Upserts into `public.profiles` using the authenticated user's id as
 *     the row PK. The existing `profiles_update_own` and `profiles_insert_own`
 *     RLS policies ensure a malicious request can only ever touch the
 *     caller's own row.
 *   - All numeric inputs are coerced from the FormData string side, then
 *     validated server-side regardless of whether the client validated
 *     them too.
 *
 * Returns `{ ok: true, savedAt: <iso> }` on success or `{ error: string }`
 * on failure. `useActionState` on the client renders the result.
 *
 * The `SaveSettingsState` type and `SAVE_SETTINGS_INITIAL` constant live
 * in `./_state.ts` — Next 16 forbids non-async exports from `"use server"`
 * files at runtime.
 */

/** Trim a FormData entry into a non-empty string or null. */
function fdString(fd: FormData, key: string): string | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Coerce a FormData entry into a finite number, or null if empty/invalid. */
function fdNumber(fd: FormData, key: string): number | null {
  const raw = fd.get(key);
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export async function saveSettings(
  _prev: SaveSettingsState,
  formData: FormData,
): Promise<SaveSettingsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const businessName = fdString(formData, "business_name");
  const email = fdString(formData, "email");
  const phone = fdString(formData, "phone");
  const address = fdString(formData, "address");
  const gstNumber = fdString(formData, "gst_number");
  const paymentInstructions = fdString(formData, "payment_instructions");
  const country = fdString(formData, "country");
  const currency = fdString(formData, "currency");
  const gstRate = fdNumber(formData, "tax_rate");
  const labourRate = fdNumber(formData, "default_labour_rate");
  const markupPct = fdNumber(formData, "default_markup_pct");

  // Server-side validation (matches the client hints).
  if (gstRate !== null && (gstRate < 0 || gstRate > 100)) {
    return { status: "error", message: "GST rate must be between 0 and 100." };
  }
  if (labourRate !== null && labourRate < 0) {
    return { status: "error", message: "Labour rate cannot be negative." };
  }
  if (markupPct !== null && (markupPct < 0 || markupPct > 100)) {
    return { status: "error", message: "Markup must be between 0 and 100." };
  }
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: "error", message: "That email doesn't look right." };
  }
  if (paymentInstructions !== null && paymentInstructions.length > 500) {
    return {
      status: "error",
      message: "Payment instructions must be 500 characters or fewer.",
    };
  }

  const { error } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        business_name: businessName,
        email,
        phone,
        address,
        gst_number: gstNumber,
        payment_instructions: paymentInstructions,
        country,
        currency,
        tax_rate: gstRate,
        default_labour_rate: labourRate,
        default_markup_pct: markupPct,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) {
    console.error("saveSettings upsert failed", error);
    return {
      status: "error",
      message: "Couldn't save your settings. Try again in a moment.",
    };
  }

  revalidatePath("/app/settings");
  return { status: "ok", savedAt: new Date().toISOString() };
}
