import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Screen } from "@/components/ui/screen";
import { SectionTitle } from "@/components/ui/section-title";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isNewLookOn } from "@/lib/ui/newLook";
import { businessTimeZone } from "../_v2/lib/dates";
import { JOBS_PATH, buildJobRows, oldLookHrefForJobs, parseJobFilter } from "../_v2/lib/job-board";
import { loadBoard } from "../_v2/lib/load-board";
import { JobsBrowser } from "./_components/JobsBrowser";

export const metadata: Metadata = {
  title: "Jobs",
};

export const dynamic = "force-dynamic";

/** The request's clock, outside the component body (react-hooks/purity). */
function requestTime(): Date {
  return new Date();
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * /app/jobs — new look only (redesign phase 2): one list, one row per
 * quote, its invoice folded in. Replaces the Quotes and Invoices lists in
 * the new look. With the new look off it hands over to the old list that
 * fits the filter, so the old look is unchanged.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string | string[] }>;
}) {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const { show } = await searchParams;
  if (!(await isNewLookOn())) redirect(oldLookHrefForJobs(parseJobFilter(firstValue(show))));

  const supabase = await createClient();
  const [board, profile] = await Promise.all([
    loadBoard(supabase, user.id),
    supabase.from("profiles").select("country, currency").eq("id", user.id).maybeSingle(),
  ]);
  const place = (profile.data ?? {}) as { country?: string | null; currency?: string | null };
  const rows = board.failed
    ? []
    : buildJobRows(board.quotes, board.invoices, requestTime(), businessTimeZone(place.country, place.currency));

  return (
    <Screen height="fill" data-testid="jobs-screen">
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <SectionTitle size="page" description="Every quote, from first draft to paid.">
          Jobs
        </SectionTitle>
        {board.failed ? (
          <div className="mt-6">
            <Callout
              tone="bad"
              title="Couldn't load your jobs"
              action={
                <ButtonLink href={JOBS_PATH} variant="secondary">
                  Try again
                </ButtonLink>
              }
            >
              Check your signal, then try again.
            </Callout>
          </div>
        ) : (
          <JobsBrowser rows={rows} />
        )}
      </main>
    </Screen>
  );
}
