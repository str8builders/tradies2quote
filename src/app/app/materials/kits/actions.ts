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

  // 1) upsert the kit row
  let kitId = input?.id ? String(input.id) : null;
  if (kitId) {
    const { error } = await supabase
      .from("kits")
      .update({ name, trade, notes, updated_at: new Date().toISOString() })
      .eq("id", kitId)
      .eq("user_id", user.id);
    if (error) return { ok: false, error: "Could not save the kit." };
  } else {
    const { data, error } = await supabase
      .from("kits")
      .insert({ user_id: user.id, name, trade, notes })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: "Could not create the kit." };
    kitId = data.id;
  }

  // 2) replace its items — insert the new ones FIRST, and only remove the
  // previous ones once that succeeds (both RLS-scoped to this user). The
  // old delete-then-insert wiped the kit's items immediately; if the insert
  // then failed for any reason, the kit was left with its name saved but
  // zero items — silent data loss with no way back. This order means a
  // failed insert leaves the kit exactly as it was before the save.
  const { data: previous } = await supabase
    .from("kit_items")
    .select("id")
    .eq("kit_id", kitId)
    .eq("user_id", user.id);
  const previousIds = (previous ?? []).map((r) => r.id as string);

  if (items.length > 0) {
    const rows = items.map((it, idx) => ({
      kit_id: kitId as string,
      user_id: user.id,
      type: it.type,
      description: it.description,
      quantity: it.quantity,
      unit: it.unit,
      unit_price: it.unit_price,
      position: idx,
    }));
    const { error } = await supabase.from("kit_items").insert(rows);
    if (error) return { ok: false, error: "Could not save the kit's items — the previous ones are untouched." };
  }

  if (previousIds.length > 0) {
    const { error } = await supabase
      .from("kit_items")
      .delete()
      .eq("kit_id", kitId)
      .eq("user_id", user.id)
      .in("id", previousIds);
    if (error) {
      // The new items are saved; the old ones are still there too — a
      // visible duplicate to tidy up, never a silently emptied kit.
      return { ok: false, error: "Saved the new items, but couldn't clear the old ones. Remove the duplicates by hand." };
    }
  }

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
