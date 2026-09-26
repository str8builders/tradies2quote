import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { isNewLookOn } from "@/lib/ui/newLook";
import { businessOwnerFor } from "../_lib/load";
import { loadTeamMap } from "../_lib/team-map";
import { TeamMapView } from "./TeamMapView";

export const metadata: Metadata = { title: "Team map" };
export const dynamic = "force-dynamic";

/**
 * /app/timesheet/team — the business owner's live team map (new look).
 * Team members get their own timesheet instead.
 */
export default async function TeamMapPage() {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!(await isNewLookOn())) redirect("/app");
  if ((await businessOwnerFor(user.id)) !== user.id) redirect("/app/timesheet");
  const members = await loadTeamMap(user.id);
  return (
    <Screen height="fill" data-testid="team-map-screen">
      <TopBar title="Team map" subtitle="Who's clocked in, and where" back={{ href: "/app/timesheet", label: "Timesheet" }} safeArea={false} />
      <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-10 sm:px-6">
        <TeamMapView members={members} />
        <p className="mt-4 text-ui-sm text-ui-muted">
          Only people who&apos;ve turned location on, and only while they&apos;re clocked in. Updates every minute.
        </p>
      </main>
    </Screen>
  );
}
