import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveWeek } from "@/lib/timesheet/week";
import { isNewLookOn } from "@/lib/ui/newLook";
import { businessTimeZone, dayKeyInZone } from "../_v2/lib/dates";
import { loadTopBarData } from "../_v2/lib/top-bar";
import { TabTopBar } from "../_v2/shell/TabTopBar";
import { loadTimesheet } from "./_lib/load";
import { TimesheetView } from "./_components/TimesheetView";

export const metadata: Metadata = { title: "Timesheet" };
export const dynamic = "force-dynamic";

/** The request's clock, outside the component body (react-hooks/purity). */
function requestTime(): Date {
  return new Date();
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /app/timesheet — the Timesheet tab (new look). Hours per day, the week at
 * a glance, and the owner's "Invoice this week". ?week=YYYY-MM-DD picks the
 * week; ?add=today (Home's "Log hours") opens the add sheet.
 */
export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string | string[]; add?: string | string[] }>;
}) {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  if (!(await isNewLookOn())) redirect("/app");
  const params = await searchParams;

  const db = await createClient();
  const [{ data: place }, bar] = await Promise.all([
    db.from("profiles").select("country, currency").eq("id", user.id).maybeSingle(),
    loadTopBarData(),
  ]);
  const zone = businessTimeZone(place?.country ?? null, place?.currency ?? null);
  const now = requestTime();
  const today = dayKeyInZone(now, zone) ?? now.toISOString().slice(0, 10);
  const data = await loadTimesheet({ userId: user.id, weekStart: resolveWeek(first(params.week), today), today });

  return (
    <Screen height="fill" data-testid="timesheet-screen">
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <TabTopBar
          data={bar}
          title="Timesheet"
          description={data.canInvoice ? "Everyone's hours, and invoice a client for the week." : "Your hours, day by day."}
        />
        <TimesheetView data={data} openAdd={first(params.add) === "today"} />
      </main>
    </Screen>
  );
}
