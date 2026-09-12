import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppHeader } from "../_components/AppHeader";
import { TeamManager } from "./TeamManager";
export const metadata = { title: "Your team" };
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  return <div className="min-h-screen text-white"><AppHeader context="Your team" /><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><div className="t2q-section-label-pro">{"// better together"}</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">Your team.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">One subscription. A shared address book. Each person signs in with their own account and manages their own quotes.</p><TeamManager initialInvite={invite} /></main></div>;
}
