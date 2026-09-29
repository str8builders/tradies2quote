import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { planReaderAllowed } from "@/lib/planreader/flag";
import { hasAiConsent } from "@/lib/ai-consent";
import { isNativeShellRequest } from "@/lib/native-shell";
import type { PlanSetListItem } from "@/lib/planset/api-types";
import { PlansHome } from "./_components/PlansHome";

export const metadata: Metadata = { title: "Read drawings" };
export const dynamic = "force-dynamic";

/**
 * /app/drawings — upload a whole consented plan set; the list of sets read so
 * far. Owner-only while the reader is proven on real plans (404 otherwise).
 */
export default async function PlansPage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!planReaderAllowed(user.email)) notFound();
  const supabase = await createClient();
  const [{ data }, nativeShell, consented] = await Promise.all([
    supabase
      .from("plan_sets" as never)
      .select("id, original_filename, status, step, progress, page_count, quote_id, error, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    isNativeShellRequest(),
    hasAiConsent(supabase, user.id),
  ]);
  // Guideline 5.1.2(i): in the iPhone app, ask before anything goes to the AI.
  return <PlansHome sets={(data ?? []) as unknown as PlanSetListItem[]} needsConsent={nativeShell && !consented} />;
}
