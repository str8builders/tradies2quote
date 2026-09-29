import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { planReaderAllowed } from "@/lib/planreader/flag";
import { PlanSetScreen } from "./_components/PlanSetScreen";

export const metadata: Metadata = { title: "Drawings" };
export const dynamic = "force-dynamic";

/** /app/drawings/{id} — reading progress, then the review of what was read. */
export default async function PlanSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!planReaderAllowed(user.email)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("plan_sets" as never).select("id, original_filename").eq("id", id).maybeSingle();
  if (!data) notFound();
  const row = data as unknown as { id: string; original_filename: string };
  return <PlanSetScreen id={row.id} name={row.original_filename} />;
}
