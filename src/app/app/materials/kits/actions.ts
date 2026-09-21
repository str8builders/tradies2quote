"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { kitsEnabled, type KitItemInput, type KitItemType } from "@/lib/kits";

export type SaveKitResult = { ok: true; id: string } | { ok: false; error: string };

type SaveKitInput = {
  id?: string | null;
  name: string;
  trade?: string | null;
  notes?: string | null;
  items: KitItemInput[];
};

function cleanType(value: unknown): KitItemType {
  return value === "labour" || value === "other" ? value : "material";
}

function sanitizeItems(items: unknown): KitItemInput[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((raw) => {
      const i = (raw ?? {}) as Record<string, unknown>;
      const description = String(i.description ?? "").trim();
      if (!description) return null;
      return {
        type: cleanType(i.type),
        description,
        quantity: Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : 1,
        unit: i.unit ? String(i.unit).trim() : null,
        unit_price: Number.isFinite(Number(i.unit_price)) ? Number(i.unit_price) : 0,
      } satisfies KitItemInput;
    })
    .filter((x): x is KitItemInput => x !== null);
}

/**
 * Create or update a kit and replace its line items in one call. Ownership is
 * enforced by RLS — the user client can only ever touch the signed-in tradie's
 * own rows, so there's no way to write into someone else's kit.
 */
export async function saveKit(input: SaveKitInput): Promise<SaveKitResult> {
  if (!kitsEnabled()) return { ok: false, error: "Kits are not enabled." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = String(input?.name ?? "").trim();
  if (!name) return { ok: false, error: "Give the kit a name." };
  const trade = input?.trade ? String(input.trade).trim() || null : null;
  const notes = input?.notes ? String(input.notes).trim() || null : null;
  const items = sanitizeItems(input?.items);

  // The header and all lines commit or roll back together.
  const { data: kitId, error } = await supabase.rpc("save_kit_atomic", {
    p_id: input?.id || null, p_name: name, p_trade: trade, p_notes: notes, p_items: items,
  });
  if (error || !kitId) return { ok: false, error: "Could not save the kit. Your previous kit has not been changed." };

  revalidatePath("/app/materials/kits");
  return { ok: true, id: kitId as string };
}

export async function deleteKit(id: string): Promise<{ ok: boolean }> {
  if (!kitsEnabled()) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // kit_items cascade on the FK; this delete is RLS-scoped to the owner.
  const { error } = await supabase.from("kits").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/app/materials/kits");
  return { ok: !error };
}
