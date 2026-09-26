import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { createClient } from "@/lib/supabase/server";
import { isNativeShellRequest } from "@/lib/native-shell";
import { teamWords } from "@/lib/team-copy";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../_components/AppHeader";
import { TeamManager } from "./TeamManager";
import { TeamCards } from "./_newlook/TeamCards";
export const metadata = { title: "Your team" };
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const db = await createClient(); const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  // 3.1.3(f): inside the iPhone app, no plan names, subscriptions or plan links (decided here, on the server).
  const [inApp, newLook] = await Promise.all([isNativeShellRequest(), isNewLookOn()]);
  // Redesign: settings-style cards under <AppHeader>'s top bar, same actions and words. Off: unchanged below.
  if (newLook) {
    return (
      <Screen data-testid="team-screen">
        <AppHeader context="Your team" />
        <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10">
          <p className="text-ui-base text-ui-muted">{teamWords(inApp).intro}</p>
          <TeamCards initialInvite={invite} inApp={inApp} />
        </div>
      </Screen>
    );
  }
  return <div className="min-h-screen text-white"><AppHeader context="Your team" /><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6"><header className="t2q-page-intro"><div className="t2q-section-label-pro">{"// better together"}</div><h1 className="mt-3 text-3xl font-semibold tracking-tight">Your team.</h1><p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-300">{teamWords(inApp).intro}</p></header><TeamManager initialInvite={invite} inApp={inApp} /></main></div>;
}
