import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stage 4.5 — user correction learning.
 *
 * When a tradie edits a material line on a generated quote (changes the
 * description, price, supplier, attributes, etc.), we save that correction
 * as a USER-SCOPED material so the next quote can match the user's row
 * before the global catalogue. Optionally, the original spoken/AI text is
 * captured as an alias on the user's material so phrasings like "gib aqua"
 * or "decking screws" learn to match the user's preferred SKU.
 *
 * Hard guarantees:
 *
 *   1) User corrections are owner-scoped — `user_id` is required and is
 *      always set on the inserted/updated row.
 *   2) Global seed rows (user_id IS NULL) are NEVER overwritten by this
 *      function. The lookup query filters by user_id = userId, so a
 *      same-named global catalogue row is invisible to this code.
 *   3) Aliases created here are linked to the user's material, so
 *      `material_aliases` RLS keeps them invisible to other users.
 *   4) None of these fields surface on the public quote payload — the
 *      `get_quote_by_token` RPC strips internal columns before serving.
 *
 * The function is intentionally agnostic about *which* Supabase client the
 * caller passes:
 *
 *   - User-session client (`createClient()` from supabase/server) — RLS
 *     enforces ownership; pass the user's own session.
 *   - Admin client (`adminClient()`) — bypasses RLS but the function still
 *     writes only rows tagged with the supplied userId.
 *
 * The lib never escalates privileges on its own.
 */

export type MaterialCorrection = {
  /** Canonical name the tradie wants for this material. Required. */
  canonicalName: string;
  /**
   * Original AI/voice text that was wrong. If present and different from
   * `canonicalName`, it becomes a `user_correction` alias on the saved row.
   */
  originalText?: string;
  category?: string;
  brand?: string;
  supplier?: string;
  unit: string;
  unitPrice: number;
  attributes?: Record<string, unknown>;
};

export type SaveCorrectionResult = {
  materialId: string;
  /** True iff a new user-scoped material row was inserted. */
  inserted: boolean;
  /** True iff a user-scoped alias row was created. */
  aliasCreated: boolean;
};

export async function saveMaterialCorrection(
  supabase: SupabaseClient,
  userId: string,
  correction: MaterialCorrection,
): Promise<SaveCorrectionResult> {
  if (!userId) {
    throw new Error("saveMaterialCorrection: userId is required");
  }
  const trimmedName = (correction.canonicalName ?? "").trim();
  if (!trimmedName) {
    throw new Error("saveMaterialCorrection: canonicalName is required");
  }
  if (!correction.unit) {
    throw new Error("saveMaterialCorrection: unit is required");
  }

  const normalized = trimmedName.toLowerCase();

  // Look up an existing USER-SCOPED material with the same name.
  // We deliberately filter user_id = userId so that the lookup never sees
  // global catalogue rows. This prevents an "update" that would otherwise
  // (without RLS) overwrite a global seed row.
  const { data: existing, error: lookupError } = await supabase
    .from("materials")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", trimmedName)
    .limit(1)
    .maybeSingle();
  if (lookupError) {
    throw new Error(
      `saveMaterialCorrection: lookup failed: ${lookupError.message}`,
    );
  }

  // Only the fields this correction actually carries. A quote-save
  // correction knows the name, unit and price — it must not wipe the
  // library row's supplier, category, brand or attributes with blanks.
  const now = new Date().toISOString();
  const baseFields: Record<string, unknown> = {
    name: trimmedName,
    normalized_name: normalized,
    unit: correction.unit,
    default_unit_price: correction.unitPrice,
    price_source: "user_library",
    price_confidence: "high",
    price_last_checked_at: now,
    updated_at: now,
  };
  if (correction.category !== undefined) baseFields.category = correction.category;
  if (correction.brand !== undefined) baseFields.brand = correction.brand;
  if (correction.supplier !== undefined) baseFields.supplier = correction.supplier;
  if (correction.attributes !== undefined) baseFields.attributes = correction.attributes;

  let materialId: string;
  let inserted: boolean;

  if (existing?.id) {
    const { error } = await supabase
      .from("materials")
      .update(baseFields)
      .eq("id", existing.id)
      .eq("user_id", userId); // belt-and-braces; RLS already enforces this
    if (error) {
      throw new Error(
        `saveMaterialCorrection: update failed: ${error.message}`,
      );
    }
    materialId = existing.id;
    inserted = false;
  } else {
    const { data: insertedRow, error } = await supabase
      .from("materials")
      .insert({
        user_id: userId,
        country: "NZ",
        active: true,
        gst_included: true,
        category: null,
        brand: null,
        supplier: null,
        attributes: {},
        ...baseFields,
      })
      .select("id")
      .single();
    if (error || !insertedRow) {
      throw new Error(
        `saveMaterialCorrection: insert failed: ${error?.message ?? "no data returned"}`,
      );
    }
    materialId = (insertedRow as { id: string }).id;
    inserted = true;
  }

  // Optional alias from the original AI/voice text.
  let aliasCreated = false;
  const original = (correction.originalText ?? "").trim();
  if (original) {
    const aliasNorm = original.toLowerCase();
    if (aliasNorm !== normalized) {
      const { error: aliasError } = await supabase
        .from("material_aliases")
        .insert({
          material_id: materialId,
          alias: original,
          normalized_alias: aliasNorm,
          source: "user_correction",
          confidence: "medium",
        });
      if (!aliasError) {
        aliasCreated = true;
      }
      // Unique-violation (alias already exists) is OK; leave aliasCreated=false.
    }
  }

  return { materialId, inserted, aliasCreated };
}
