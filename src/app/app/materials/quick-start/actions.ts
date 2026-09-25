"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { round2 } from "@/lib/quote-defaults";
import { createClient } from "@/lib/supabase/server";
import { STARTER_MATERIALS } from "./_data";

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

  const rows = STARTER_MATERIALS.map((m) => {
    const price = parsePrice(formData.get(`price_${m.slug}`));
    return price === null
      ? null
      : {
          user_id: user.id,
          name: m.name,
          unit: m.unit,
          category: m.category,
          default_unit_price: price,
          country: "NZ",
          is_ai_estimated: false,
          price_source: "user_library",
          price_confidence: "high",
        };
  }).filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    // Nothing to insert — let the page redirect to the dashboard
    // anyway so the banner disappears and the tradie can come back
    // later. We don't surface this as an error; "skip" is valid.
    redirect("/app?onboarded=skipped");
  }

  // Defence-in-depth: the materials table has a unique (user_id, name)
  // constraint. If the tradie already manually added one of these
  // names, the insert below will 23505. Use upsert so a repeat run is
  // idempotent and never errors the form.
  const { error } = await supabase
    .from("materials")
    .upsert(rows, { onConflict: "user_id,name", ignoreDuplicates: true });

  if (error) {
    console.error("saveQuickStartMaterials failed", error);
    return { error: "Could not save your materials. Try again." };
  }

  revalidatePath("/app/materials");
  revalidatePath("/app");
  redirect(`/app?onboarded=${rows.length}`);
}
