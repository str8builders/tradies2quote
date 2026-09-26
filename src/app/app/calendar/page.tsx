import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { TopBar } from "@/components/ui/top-bar";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { ScheduleCalendar } from "../_components/ScheduleCalendar";
import { businessTimeZone, dayKeyInZone } from "../_v2/lib/dates";
import { calendarJobsFromRows, calendarNotesFromRows } from "./_lib/calendar-data";

export const metadata: Metadata = {
  title: "Calendar",
};

export const dynamic = "force-dynamic";

/** Today's calendar day in the business's time zone (outside the component body for react-hooks/purity). */
function todayKey(timeZone: string): string {
  return dayKeyInZone(new Date(), timeZone) ?? new Date().toISOString().slice(0, 10);
}

/**
 * /app/calendar (new look): the month calendar of booked jobs and the
 * owner's day notes — the same data and component the old dashboard shows
 * (scheduled quotes with a date, `calendar_notes`). In the old look the
 * calendar lives on the dashboard, so this route hands over to /app.
 */
export default async function CalendarPage() {
  if (!(await isNewLookOn())) redirect("/app");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: jobRows }, { data: noteRows }] = await Promise.all([
    supabase.from("profiles").select("country, currency").eq("id", user.id).maybeSingle(),
    // Same query as the old dashboard calendar.
    supabase
      .from("quotes")
      .select(
        "id, scheduled_for, total_amount, currency, job_summary:quote_data->>job_summary, client_name:quote_data->client->>name",
      )
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .is("deleted_at", null)
      .not("scheduled_for", "is", null)
      .order("scheduled_for", { ascending: true })
      .limit(200),
    supabase
      .from("calendar_notes")
      .select("id, note_date, body")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(500),
  ]);

  const zone = businessTimeZone(profile?.country ?? null, profile?.currency ?? null);

  return (
    <Screen height="fill" data-testid="calendar-page">
      <TopBar title="Calendar" back={{ href: "/app/more", label: "More" }} safeArea={false} />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 pt-5 pb-10">
        <p className="text-ui-base text-ui-muted">Your booked jobs and your notes for each day. Tap a day to add a note.</p>
        <ScheduleCalendar
          look="new"
          jobs={calendarJobsFromRows(jobRows ?? [])}
          notes={calendarNotesFromRows(noteRows ?? [])}
          todayISO={todayKey(zone)}
        />
      </div>
    </Screen>
  );
}
