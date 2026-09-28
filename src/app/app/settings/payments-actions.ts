"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { paymentsEnabled, setDepositPct } from "@/lib/payments";

/** Save the tradie's deposit percentage (only meaningful once connected). */
export async function saveDepositPctAction(pct: number): Promise<{ ok: boolean; error?: string }> {
  if (!paymentsEnabled()) return { ok: false, error: "Not enabled." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clamped = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
  try {
    const saved = await setDepositPct(user.id, clamped);
    if (!saved.ok) return { ok: false, error: saved.error };
  } catch {
    // setDepositPct reports database errors itself; this is the network.
    return { ok: false, error: "Couldn't save the deposit. Check your signal and try again." };
  }
  revalidatePath("/app/settings");
  return { ok: true };
}
