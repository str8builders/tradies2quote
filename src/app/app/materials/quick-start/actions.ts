"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { round2 } from "@/lib/quote-defaults";
import { createClient } from "@/lib/supabase/server";
import { loadAllMaterials } from "@/lib/materials/loadLibrary";
import { nameKey } from "@/lib/materials/priceList";
import { ALL_STARTER_MATERIALS } from "./_data";

export type QuickStartResult =
  | { ok: true; inserted: number; skipped: number }
  | { error: string };

function parsePrice(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  // To the cent, exact half-up — the app's one money rounding rule.
  return round2(n);
}

export async function saveQuickStartMaterials(
  _prev: QuickStartResult,
  formData: FormData,
): Promise<QuickStartResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Prices for any trade's list: a plumber who also builds can price both and
  // save once. Only the known starter items are read, never client-made rows.
  const rows = ALL_STARTER_MATERIALS.map((m) => {
    const price = parsePrice(formData.get(`price_${m.slug}`));
    return price === null ? null : { name: m.name, unit: m.unit, category: m.category, default_unit_price: price };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    // Nothing to insert — let the page redirect to the dashboard
    // anyway so the banner disappears and the tradie can come back
    // later. We don't surface this as an error; "skip" is valid.
    redirect("/app?onboarded=skipped");
  }

  // Case-insensitive (trimmed, spaces collapsed) match against what's
  // already saved — the same rule the rest of the library uses for a
  // duplicate name. A starter item already there (any case/spacing) is
  // reported as "already in your list", never silently dropped and never
  // counted as newly added.
  let existingKeys: Set<string>;
  try {
    const existing = await loadAllMaterials<{ name: string }>(supabase, user.id, { select: "name" });
    existingKeys = new Set(existing.map((m) => nameKey(m.name)));
  } catch (e) {
    console.error("saveQuickStartMaterials: reading the library failed", e);
    return { error: "Could not save your materials. Try again." };
  }

  const toInsert = rows.filter((r) => !existingKeys.has(nameKey(r.name)));
  const alreadyThere = rows.length - toInsert.length;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("materials").insert(
      toInsert.map((r) => ({
        user_id: user.id,
        name: r.name,
        unit: r.unit,
        category: r.category,
        default_unit_price: r.default_unit_price,
        country: "NZ",
        is_ai_estimated: false,
        price_source: "user_library",
        price_confidence: "high",
      })),
    );
    if (error) {
      console.error("saveQuickStartMaterials failed", error);
      return { error: "Could not save your materials. Try again." };
    }
  }

  revalidatePath("/app/materials");
  revalidatePath("/app");
  // Land on the list itself, which says what happened: `started` is the
  // count actually ADDED (never a claim about rows that were already there),
  // `already` how many the tradie had.
  redirect(
    `/app/materials?started=${toInsert.length}${alreadyThere > 0 ? `&already=${alreadyThere}` : ""}`,
  );
}
