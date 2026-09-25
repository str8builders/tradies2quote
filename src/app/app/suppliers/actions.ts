"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { round2 } from "@/lib/quote-defaults";
import { createClient } from "@/lib/supabase/server";

/**
 * Server action for the in-app supplier browser save flow.
 *
 * Mirrors createMaterial in ../materials/actions.ts but returns a
 * JSON-ish result instead of redirecting — the supplier browser stays
 * on /app/suppliers after a save so the tradie can grab the next
 * product without losing their iframe state.
 */

export type SupplierSaveResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

function parsePrice(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  // To the cent, exact half-up — the app's one money rounding rule.
  return round2(n);
}

function parseString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function optional(raw: unknown): string | null {
  const v = parseString(raw);
  return v.length > 0 ? v : null;
}

export async function saveSupplierMaterial(input: {
  name: unknown;
  unit: unknown;
  default_unit_price: unknown;
  supplier: unknown;
  supplier_url: unknown;
  notes: unknown;
}): Promise<SupplierSaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = parseString(input.name);
  const unit = parseString(input.unit);
  const price = parsePrice(input.default_unit_price);

  if (!name) return { ok: false, error: "Name is required." };
  if (!unit) return { ok: false, error: "Unit is required." };
  if (price === null)
    return { ok: false, error: "Price must be a non-negative number." };

  const { data, error } = await supabase
    .from("materials")
    .insert({
      user_id: user.id,
      name,
      unit,
      default_unit_price: price,
      supplier: optional(input.supplier),
      supplier_url: optional(input.supplier_url),
      notes: optional(input.notes),
      is_ai_estimated: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "You already have a material with that name.",
      };
    }
    console.error("saveSupplierMaterial failed", error);
    return { ok: false, error: "Could not save material." };
  }

  revalidatePath("/app/materials");
  return { ok: true, id: data.id };
}
