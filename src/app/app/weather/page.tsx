import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CloudSun, Lock } from "@phosphor-icons/react/dist/ssr";
import { AppHeader } from "../_components/AppHeader";
import {
  WeatherImpactClient,
  type JobLocation,
  type JobOption,
} from "./_components/WeatherImpactClient";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";
import { isWeatherImpactEnabled } from "@/lib/weather-impact";
import { geocodeAddress } from "@/lib/weather-planning/geocode";
import { addressFromQuoteData } from "@/lib/weather-planning/jobAddress";

export const metadata: Metadata = {
  title: "Weather Impact",
};

export const dynamic = "force-dynamic";

/**
 * Weather Impact — JOB-LOCATION-FIRST (P0 weather slice).
 *
 * The location the weather is for must be the client/customer job site
 * stored on the quote — never implicitly the tradie's device. This server
 * component:
 *   1. lists the user's quotes that carry a client address (job picker),
 *   2. for the selected ?quote=, resolves coordinates server-side:
 *      quote_site_context (already geocoded by the planning pipeline) first,
 *      else geocode the stored address now (no persistence here — the
 *      assess pipeline owns quote_site_context writes),
 *   3. passes the resolved location to the client, which fetches live
 *      weather for IT. Device location exists only as an explicit, labeled
 *      user choice inside the client component.
 */
export default async function WeatherImpactPage({
  searchParams,
}: {
  searchParams: Promise<{ quote?: string }>;
}) {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");

  const enabled = isWeatherImpactEnabled(isOwnerEmail(user.email));
  const { quote: selectedQuoteId } = await searchParams;

  let jobOptions: JobOption[] = [];
  let jobLocation: JobLocation | null = null;
  let geocodeFailed = false;

  if (enabled) {
    const supabase = await createClient();
    // Scheduled jobs first (the ones weather decisions are about), then the
    // most recent others. RLS scopes everything to this user.
    const { data: rows } = await supabase
      .from("quotes")
      .select("id, status, scheduled_for, quote_data")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .order("scheduled_for", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(40);

    for (const row of rows ?? []) {
      const address = addressFromQuoteData(row.quote_data);
      if (!address) continue; // no job address on record → not offerable
      const qd = row.quote_data as Record<string, unknown> | null;
      const summary =
        qd && typeof qd.job_summary === "string" && qd.job_summary.trim()
          ? qd.job_summary.trim()
          : "Quote";
      jobOptions.push({
        id: row.id,
        label: `${summary.slice(0, 60)} — ${address.slice(0, 60)}`,
        address,
        scheduled: row.status === "scheduled",
      });
    }
    // Scheduled jobs at the top of the picker; cap the list.
    jobOptions = [
      ...jobOptions.filter((o) => o.scheduled),
      ...jobOptions.filter((o) => !o.scheduled),
    ].slice(0, 20);

    const selected = selectedQuoteId
      ? jobOptions.find((o) => o.id === selectedQuoteId) ?? null
      : null;

    if (selected) {
      // 1. Reuse coordinates the planning pipeline already resolved.
      const { data: ctx } = await supabase
        .from("quote_site_context")
        .select("latitude, longitude, geocoded_address")
        .eq("quote_id", selected.id)
        .maybeSingle();
      if (ctx?.latitude != null && ctx?.longitude != null) {
        jobLocation = {
          quoteId: selected.id,
          address: selected.address,
          latitude: ctx.latitude,
          longitude: ctx.longitude,
          matchedName: ctx.geocoded_address ?? selected.address,
          resolvedFrom: "site_context",
        };
      } else {
        // 2. Geocode the stored job address now (server-side, free API).
        const geo = await geocodeAddress({ address: selected.address });
        if (geo) {
          jobLocation = {
            quoteId: selected.id,
            address: selected.address,
            latitude: geo.latitude,
            longitude: geo.longitude,
            matchedName: geo.matchedName,
            resolvedFrom: "geocoded_now",
          };
        } else {
          geocodeFailed = true;
        }
      }
    }
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Weather Impact" />

      <main data-legacy-body="" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="t2q-page-intro mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <Link href="/app" className="t2q-btn-back mb-4">
              <ArrowLeft size={15} weight="bold" />
              Dashboard
            </Link>
            <p className="t2q-section-label-pro">{"// job site decision tool"}</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight sm:text-5xl">
              Weather Impact.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-300 sm:text-base">
              Pick the job, and the live weather loads for that site. Then set
              the trade and conditions for a deterministic safe / caution /
              unsafe call with the exact reasons.
            </p>
          </div>
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
            <CloudSun size={26} weight="bold" aria-hidden="true" />
          </span>
        </div>

        {enabled ? (
          <WeatherImpactClient
            jobOptions={jobOptions}
            selectedQuoteId={selectedQuoteId ?? null}
            jobLocation={jobLocation}
            geocodeFailed={geocodeFailed}
          />
        ) : (
          <section className="t2q-card-pro p-6">
            <div className="flex items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
                <Lock size={24} weight="bold" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xl font-semibold text-white">
                  Weather Impact is in owner testing.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-300">
                  This keeps the new safety engine behind a rollout gate until
                  the rules and wording have been checked on real job examples.
                </p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
