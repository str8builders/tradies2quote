import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bug,
  CalendarBlank,
  ChatCircleText,
  Stack,
  Gauge,
  Plus,
  Robot,
  TrendUp,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { formatCurrency, round2 } from "@/lib/quote-defaults";
import type { QuoteStatus } from "@/lib/quote-types";
import { isOwnerEmail } from "@/lib/owner";
import { STAGE_LABELS } from "@/lib/lifecycle/stages";
import { AppHeader } from "./_components/AppHeader";
import { DashboardSkeleton } from "./_components/DashboardSkeleton";
import { StaggerIn } from "./_components/StaggerIn";
import { ScheduleCalendar } from "./_components/ScheduleCalendar";
import { WeekOutlook } from "./_components/WeekOutlook";
import { getWeekOutlook } from "@/lib/weather-impact/outlook";
import { SiteConditions } from "./_components/SiteConditions";
import { T2QCALIcon } from "./_components/T2QCALIcon";
import { RequestCodeCard } from "./_components/RequestCodeCard";
import { LocalWeather } from "./_components/LocalWeather";
import { isNewLookOn } from "@/lib/ui/newLook";
import { NewHome } from "./_v2/home/NewHome";
import { loadTopBarData } from "./_v2/lib/top-bar";

/** Priced library items before the "set your prices" banner stops showing. */
const PRICED_LIBRARY_TARGET = 8;

export const metadata: Metadata = {
  title: "Dashboard",
};

export const dynamic = "force-dynamic";

/**
 * /app — dashboard.
 *
 * Wave 10 — lean overview that:
 *   - Welcomes the user by name.
 *   - No quote list here: every quote (archived + deleted filtered
 *     out server-side).
 *   - Provides one-click access to the full management hub at
 *     `/app/quotes` for search + filter + archive + soft-delete.
 *   - Keeps the existing "New quote" and "Materials" jump buttons.
 *
 * Quotes are NOT listed here any more (owner request, 2026-09-13): the
 * dashboard is the work board, and every quote lives in the Quotes tab
 * (`/app/quotes`), which already carries search, filters, archive and
 * delete. The hero keeps a "Quotes" jump button so the tab is one tap away.
 */

export default async function DashboardPage() {
  // Wave 17 — perf — auth runs in the page so we can paint the static
  // frame (header + welcome heading) before the dashboard's Supabase
  // queries finish. The data-driven sections (stats card, recent
  // quotes, agents card, debug footer) live in `<DashboardData />` and
  // stream in under a `<Suspense>` boundary backed by
  // `<DashboardSkeleton />`. Previously the entire page waited for two
  // queries before sending ANY HTML, which read as a blank screen on
  // first /app entry over 4G.
  // Wave 18.1 — perf — cached. The same `getUser()` call is reused by
  // `<AppHeader>` and `<MobileAppMenu>` within this render.
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  // Redesign phase 2: the new-look Home ("what needs doing today").
  if (await isNewLookOn()) {
    return <NewHome userId={user.id} isOwner={isOwnerEmail(user.email)} bar={await loadTopBarData()} />;
  }

  const username = user.email?.split("@")[0] ?? "tradie";
  // Owner-only Debug link + Agents card visibility. Server-rendered,
  // no client check, so neither is serialised into the client bundle
  // for non-owner accounts. Wave 13 — extended to also gate the
  // Agents card below; previously the card was visible to all tradies.
  const isOwner = isOwnerEmail(user.email);

  return (
    <div className="min-h-screen text-white">
      <AppHeader />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        <div
          data-testid="dashboard-hero"
          className="mb-7 flex flex-col gap-6 sm:mb-8"
        >
          <div className="min-w-0">
            <div className="t2q-dashboard-eyebrow mb-4"><span aria-hidden="true" />Your working day, organised</div>
            <h1 className="font-display text-[2rem] leading-[1.05] uppercase tracking-tight sm:text-[2.5rem]">
              Welcome back,<br /><span className="t2q-dashboard-name">{username}.</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300 sm:text-base">
              From the first site note to the next job. Keep it all moving here.
            </p>
          </div>
          <div
            data-testid="dashboard-actions"
            className="relative flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/app/quotes"
              data-testid="dashboard-view-quotes"
              className="t2q-btn-ghost-pro"
            >
              Quotes
              <ArrowRight size={15} weight="bold" />
            </Link>
            <Link
              href="/app/quotes/new"
              data-testid="dashboard-new-quote"
              className="t2q-btn-primary-pro"
            >
              <Plus size={18} weight="bold" />
              New quote
            </Link>
          </div>
        </div>

        <Link href="/t2qcal/calculators" data-testid="dashboard-calculators-card"
          className="t2q-cal-shortcut" aria-label="Open T2QCAL site calculators">
          <T2QCALIcon />
          <span className="t2q-cal-shortcut-copy">
            <strong>T2Q<span>CAL</span> <span className="t2q-cal-shortcut-category">Site calculators</span></strong>
            <span>Measure it. Work it out. Add it to your quote.</span>
          </span>
          <span className="t2q-cal-shortcut-open">Open <ArrowRight size={18} weight="bold" aria-hidden="true" /></span>
        </Link>

        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardData userId={user.id} isOwner={isOwner} />
        </Suspense>
      </main>
    </div>
  );
}

/**
 * Wave 17 — perf — data-driven body of the dashboard.
 *
 * Split out from `DashboardPage` so a `<Suspense>` boundary above can
 * stream the welcome heading + skeleton to the browser BEFORE the two
 * quotes queries land. Once they resolve, the real markup swaps in
 * with zero layout shift (the skeleton mirrors the same card padding
 * + border widths).
 *
 * Receives `userId` instead of calling `auth.getUser()` itself — the
 * parent has already done that, and a second auth round-trip would
 * defeat the streaming win.
 */
async function DashboardData({
  userId,
  isOwner,
}: {
  userId: string;
  isOwner: boolean;
}) {
  const supabase = await createClient();
  // Server-side "today" (YYYY-MM-DD) passed to the calendar so SSR + the
  // client agree on which cell to highlight/select (no hydration drift).
  const todayISO = serverTodayISO();
  // Wave 10.5 — pull lightweight aggregates for the dashboard stats
  // panel (no platform-wide hype numbers, just this user's own data).
  // Stats query is intentionally separate from the recent-quotes query
  // so it can scan all the user's non-deleted rows for accurate counts
  // and totals without bloating the recent-list payload.
  const [
    { data: statsRows },
    { data: profile },
    { count: materialsCount },
    { data: upcomingRows },
    { data: noteRows },
  ] = await Promise.all([
      supabase
        .from("quotes")
        .select("status, total_amount, currency, created_at")
        .eq("user_id", userId)
        .is("deleted_at", null),
      // Wave 36 — fetch just enough of the profile to detect a missing
      // business name. A business name is required before quote delivery.
      // No row exists yet for fresh signups (the upsert in
      // settings/actions creates one on first save), so `.maybeSingle()`
      // → null is the common case.
      supabase
        .from("profiles")
        .select("business_name, address, request_slug")
        .eq("id", userId)
        .maybeSingle(),
      // Count of the tradie's own PRICED materials. Generated quotes never
      // guess prices (count-first design), so a material line stays blank
      // until the library has that item's price. Drives the "set your
      // prices" banner below until the library covers the everyday items.
      supabase
        .from("materials")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gt("default_unit_price", 0),
      // Scheduled jobs with a date (quotes.scheduled_for) — drives the
      // dashboard calendar. Past + future so the tradie can page across
      // months; the calendar component buckets them by day.
      // Wave 46 perf — narrowed from the full `quote_data` JSONB blob to
      // just the two paths actually read below (job summary + client
      // name), same reasoning as the /app/quotes list query.
      supabase
        .from("quotes")
        .select(
          "id, scheduled_for, total_amount, currency, created_at, job_summary:quote_data->>job_summary, client_name:quote_data->client->>name",
        )
        .eq("user_id", userId)
        .eq("status", "scheduled")
        .is("deleted_at", null)
        .not("scheduled_for", "is", null)
        .order("scheduled_for", { ascending: true })
        .limit(200),
      // Personal calendar notes (calendar_notes) — owner's own day-notes
      // shown alongside jobs on the dashboard calendar.
      supabase
        .from("calendar_notes")
        .select("id, note_date, body")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
  const businessNameMissing =
    !profile?.business_name ||
    (typeof profile.business_name === "string" &&
      profile.business_name.trim().length === 0);
  const pricedMaterials = materialsCount ?? 0;
  const libraryEmpty = pricedMaterials === 0;
  // Keep nudging until the everyday items are priced; two saved prices
  // still leave most material lines blank on a new quote.
  const libraryThin = pricedMaterials < PRICED_LIBRARY_TARGET;

  // Client requests from the public request link that still sit as drafts.
  const { count: openRequestCount } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["new", "generated", "generation_failed"]);

  // Aggregate this user's own quote stats. Pure JS so no extra Postgres
  // RPC needed, and the query already RLS-scopes by user_id.
  // Wave 13 — extended to count every lifecycle stage so the dashboard
  // tiles surface the orchestrator's view of the pipeline.
  const stats = computeLifecycleStats(statsRows ?? []);

  const statsCurrency = stats.currency;

  const scheduledJobs = (upcomingRows ?? []).map((q) => {
    return {
      id: q.id,
      date: ((q.scheduled_for as string | null) ?? "").slice(0, 10),
      clientName: (q.client_name as string | undefined) ?? "—",
      jobSummary: (q.job_summary as string | undefined) ?? "",
      total: Number(q.total_amount) || 0,
      currency: (q.currency as string) ?? "NZD",
    };
  });

  const calendarNotes = (noteRows ?? []).map((n) => ({
    id: n.id,
    date: (n.note_date as string).slice(0, 10),
    body: n.body as string,
  }));
  const nextScheduledJob =
    scheduledJobs.find((job) => job.date >= todayISO) ?? scheduledJobs[0] ?? null;

  // Per-date weather for the calendar grid — same cached fetch the
  // <WeekOutlook /> strip uses (unstable_cache dedupes), so this adds
  // no extra upstream calls. Empty map when no address / no forecast.
  const weekOutlookData = profile?.address
    ? await getWeekOutlook(profile.address as string).catch(() => null)
    : null;
  const calendarWeather = Object.fromEntries(
    (weekOutlookData?.days ?? []).map((d) => [
      d.date,
      { status: d.status, tempMaxC: d.tempMaxC, reason: d.reason },
    ]),
  );

  return (
    <>
      {/* Client requests waiting from the public "Request a quote" link. */}
      {openRequestCount ? (
        <StaggerIn index={0}>
        <Link
          href="/app/requests"
          data-testid="dashboard-requests-banner"
          className="t2q-card-pro t2q-card-pro-hover mb-5 flex items-start gap-3 p-4 sm:items-center sm:p-5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
          >
            <ChatCircleText size={18} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm uppercase tracking-tight text-white">
              {openRequestCount} client request{openRequestCount === 1 ? "" : "s"} waiting.
            </p>
            <p className="mt-0.5 text-xs text-ink-300 sm:text-sm">
              Sent through your request link. Each one is a draft ready for you to check and send.
            </p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:inline-flex">
            Open requests
            <ArrowRight size={12} weight="bold" />
          </span>
          <ArrowRight size={18} weight="bold" className="shrink-0 text-brand sm:hidden" aria-hidden="true" />
        </Link>
        </StaggerIn>
      ) : null}

      {/* Complete business identity before exporting or sending a quote. */}
      {businessNameMissing ? (
        <StaggerIn index={0}>
        <Link
          href="/app/settings"
          data-testid="dashboard-business-name-banner"
          className="t2q-card-pro t2q-card-pro-hover mb-5 flex items-start gap-3 p-4 sm:items-center sm:p-5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
          >
            <Warning size={18} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm uppercase tracking-tight text-white">
              Set your business name first.
            </p>
            <p className="mt-0.5 text-xs text-ink-300 sm:text-sm">
              Add your trading name to download PDFs and send quotes with your business details.
            </p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:inline-flex">
            Open settings
            <ArrowRight size={12} weight="bold" />
          </span>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-brand sm:hidden"
            aria-hidden="true"
          />
        </Link>
        </StaggerIn>
      ) : null}

      {/* Wave 41 — empty-library nudge. Surfaces the bulk-seed page
          so new tradies can populate 5–10 of their most-used materials
          in 60 seconds. Without this nudge, fresh accounts ship every
          early quote with AI-estimated prices (amber stripe on every
          material line) — a confidence killer for first impressions. */}
      {libraryThin ? (
        <StaggerIn index={0}>
        <Link
          href="/app/materials/quick-start"
          data-testid="dashboard-quick-start-banner"
          className="t2q-card-pro t2q-card-pro-hover mb-5 flex items-start gap-3 p-4 sm:items-center sm:p-5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            <Plus size={18} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm uppercase tracking-tight text-white">
              {libraryEmpty
                ? "Set your prices once. It takes a few minutes."
                : `${pricedMaterials} of your prices saved. Add a few more.`}
            </p>
            <p className="mt-0.5 text-xs text-ink-300 sm:text-sm">
              Materials on a new quote stay blank until they have your
              price. Add the ones you use every week and every quote after
              that fills them in for you.
            </p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-300 sm:inline-flex">
            Quick start
            <ArrowRight size={12} weight="bold" />
          </span>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-emerald-300 sm:hidden"
            aria-hidden="true"
          />
        </Link>
        </StaggerIn>
      ) : null}

      {/* Xero-style KPI strip — four headline numbers at the top of the
          dashboard: this month's quoted total, replies awaiting, locked-in
          revenue, drafts. Each is a real aggregate from `computeLifecycleStats`.
          Hidden on empty accounts so the dashboard doesn't fake activity
          for fresh signups. */}

      {/* ── Today — the operator's home focus ──────────────────────────────
          Weather-aware "Site conditions" lives INSIDE this block (dashboard
          ownership: weather is NOT a separate feature card). Pat plans the
          field; Willa drafts customer comms. KPIs, the lifecycle pipeline and
          the month calendar are demoted into the collapsible panel below so the
          home leads with what needs attention now. */}
      <StaggerIn index={1}>
      <RequestCodeCard slug={(profile?.request_slug as string | null) ?? null} />

      <section data-testid="dashboard-today" aria-label="Today" className="mb-7">
        <div className="t2q-card-pro p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="t2q-section-label-pro">Your work at a glance</p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                Today
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-300">
                Upcoming work, quotes awaiting a reply, and the conditions on site.
              </p>
            </div>
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand/40 bg-brand/10 text-brand">
              <TrendUp size={22} weight="bold" aria-hidden="true" />
            </span>
          </div>

          {/* Weather-aware planning block — flag-gated, renders nothing when off. */}
          <SiteConditions userId={userId} />

          {/* Five-day work-suitability outlook for the tradie's own base —
              renders nothing without a profile address or forecast. */}
          <WeekOutlook
            address={(profile?.address as string | null) ?? null}
            todayISO={todayISO}
          />

          {/* Where the phone actually is: forecast + safe/caution/unsafe for every trade. */}
          <LocalWeather todayISO={todayISO} />

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <WorkBoardMetric
              label="Next job"
              tone="teal"
              icon={<CalendarBlank size={19} weight="duotone" />}
              value={nextScheduledJob ? formatShortDate(nextScheduledJob.date) : "Not scheduled"}
              detail={nextScheduledJob?.clientName ?? "Add a job date from a quote"}
            />
            <WorkBoardMetric
              label="Follow-ups"
              tone="amber"
              icon={<ChatCircleText size={19} weight="duotone" />}
              value={String(stats.byStage.sent + stats.byStage.viewed)}
              detail={
                stats.byStage.viewed > 0
                  ? `${stats.byStage.viewed} viewed by client`
                  : "Sent and viewed quotes"
              }
            />
            <WorkBoardMetric
              label="Material library"
              tone="blue"
              icon={<Stack size={19} weight="duotone" />}
              value={libraryEmpty ? "Needs setup" : `${pricedMaterials} priced`}
              detail={libraryThin ? "Add your everyday materials" : "Your prices fill in automatically"}
            />
          </div>
        </div>
      </section>
      </StaggerIn>

      {/* ── Demoted: pipeline, headline metrics & calendar (collapsed) ─────── */}
      <StaggerIn index={2}>
      <section data-testid="dashboard-more" aria-label="Pipeline, metrics and calendar" className="mb-7">
        {/* Always open (owner request 2026-09-14): the pipeline and calendar
            are the work board, not an optional extra behind a toggle. */}
        <h2
          data-testid="dashboard-more-toggle"
          data-tour="dashboard-more-toggle"
          className="t2q-section-label-pro"
        >
          <span>Pipeline, metrics & calendar</span>
        </h2>
        <div className="mt-4 space-y-7">
      {stats.totalQuotes > 0 && (
        <section
          data-testid="dashboard-kpi-strip"
          aria-label="Headline metrics"
          className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <KpiCard
            label="This month"
            value={formatCurrency(stats.thisMonthAmount, statsCurrency)}
            sub={`${stats.thisMonth} quote${stats.thisMonth === 1 ? "" : "s"} started`}
            tone="brand"
          />
          <KpiCard
            label="Awaiting reply"
            value={String(stats.byStage.sent + stats.byStage.viewed)}
            sub={
              stats.byStage.viewed > 0
                ? `${stats.byStage.viewed} viewed by client`
                : "Sent + viewed"
            }
          />
          <KpiCard
            label="Accepted"
            value={formatCurrency(stats.acceptedAmount, statsCurrency)}
            sub={`${
              stats.byStage.accepted +
              stats.byStage.scheduled +
              stats.byStage.in_progress +
              stats.byStage.completed
            } locked in`}
            tone="positive"
          />
          <KpiCard
            label="Drafts"
            value={String(stats.byStage.draft)}
            sub={
              stats.byStage.draft > 0 ? "Needs your finish" : "All clear"
            }
            tone={stats.byStage.draft > 0 ? "warning" : "neutral"}
          />
        </section>
      )}

      {/* Wave 13 — lifecycle stage tiles. Each tile is a real DB
          count for this user, keyed by the same quote_status enum
          the orchestrator drives. Tiles link into /app/quotes with
          a stage filter pre-applied so the owner can drill in. The
          secondary KPI row (Quotes this month + Total quoted) keeps
          the Wave 10.5 honest-numbers idea alive without taking up
          screen-space the lifecycle tiles need. */}
      <section
        data-testid="dashboard-stats"
        aria-label="Pipeline by lifecycle stage"
        className="t2q-card-pro mb-7 p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="t2q-section-label-pro">{"// pipeline"}</p>
        </div>
        {stats.totalQuotes === 0 ? (
          /* Empty pipeline used to render a grid of zero-count tiles
             plus a "$0.00 Total quoted" KPI — which reads as fake
             placeholder data on a fresh account. Replaced with a
             single quiet line so the dashboard introduces the
             pipeline concept without faking activity. */
          <p
            data-testid="dashboard-pipeline-empty"
            className="mt-3 text-sm leading-relaxed text-ink-300"
          >
            Your live pipeline appears here once your first quote moves
            through a stage. Hit{" "}
            <span className="text-white">New quote</span> below to start.
          </p>
        ) : (
          <>
            <div
              data-testid="dashboard-stage-tiles"
              // Wave 15.3 — mobile compaction. 3-col on phones (7 stages
              // fit in 3 rows instead of 4) with tighter gap. Desktop
              // grids unchanged.
              className="mt-3 grid grid-cols-3 gap-1.5 sm:mt-4 sm:grid-cols-4 sm:gap-2 lg:grid-cols-7"
            >
              {DASHBOARD_STAGES.map((s) => (
                <StageTile
                  key={s}
                  stage={s}
                  label={STAGE_LABELS[s]}
                  count={stats.byStage[s]}
                />
              ))}
            </div>

            {/* Secondary KPI strip — keeps the Wave 10.5 honest numbers
                without competing with the stage tiles. */}
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/5 pt-5">
              <SecondaryStat
                label="Quotes this month"
                value={stats.thisMonth.toLocaleString()}
              />
              <SecondaryStat
                label="Total quoted"
                value={formatCurrency(stats.totalAmount, statsCurrency)}
              />
            </div>
          </>
        )}
      </section>

          <ScheduleCalendar
            jobs={scheduledJobs}
            notes={calendarNotes}
            todayISO={todayISO}
            weather={calendarWeather}
          />
        </div>
      </section>
      </StaggerIn>


      {/* Wave 13 — Agents card is now owner-only. Was visible to
          every tradie in Wave 10.4; now hidden from non-owners so
          the hub doesn't show pre-launch automation features. The
          link is server-rendered behind `isOwner`, so it isn't even
          present in the HTML payload for non-owner accounts. */}
      {isOwner ? (
        <StaggerIn index={4}>
        <Link
          href="/app/agents"
          data-testid="dashboard-agents-card"
          className="t2q-card-pro t2q-card-pro-hover mt-7 flex items-center gap-4 p-4 sm:p-5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10 text-brand"
          >
            <Robot size={22} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base uppercase tracking-tight text-white sm:text-lg">
              T2Q Agents.
            </p>
            {/* Wave 14 — honest subtitle. Previously claimed
                "automations" we don't run; every agent is owner-
                approval-only and synchronous. The directory page is
                owner-only; the tools themselves render on the
                per-quote preview for every tradie. */}
            <p className="mt-0.5 text-sm text-ink-300">
              Directory of agents — quote review, compliance, voice cleanup, follow-up, admin, invoice draft.
            </p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:inline-flex">
            Open agents
            <ArrowRight size={12} weight="bold" />
          </span>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-brand sm:hidden"
            aria-hidden="true"
          />
        </Link>
        </StaggerIn>
      ) : null}

      {/* Owner-only Ops cockpit — live revenue, trials running out, and
          per-connector budget/health. Server-rendered behind `isOwner`
          so it never appears in a non-owner's HTML. */}
      {isOwner ? (
        <StaggerIn index={5}>
        <Link
          href="/app/admin"
          data-testid="dashboard-ops-card"
          className="t2q-card-pro t2q-card-pro-hover mt-4 flex items-center gap-4 p-4 sm:p-5"
        >
          <span
            aria-hidden="true"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-hivis/40 bg-hivis/10 text-hivis"
          >
            <Gauge size={22} weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-base uppercase tracking-tight text-white sm:text-lg">
              Ops cockpit.
            </p>
            <p className="mt-0.5 text-sm text-ink-300">
              Live revenue, trials running out, and connector budgets — all in one place.
            </p>
          </div>
          <span className="hidden items-center gap-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand sm:inline-flex">
            Open ops
            <ArrowRight size={12} weight="bold" />
          </span>
          <ArrowRight
            size={18}
            weight="bold"
            className="shrink-0 text-brand sm:hidden"
            aria-hidden="true"
          />
        </Link>
        </StaggerIn>
      ) : null}

      {/* Wave 14.5 — mobile tail-nav (Clients/Settings/Debug links)
          removed. The avatar tile + account sheet in
          <MobileAppMenu /> is the single home for these on mobile.
          Desktop still has Settings (cog icon) in the AppHeader, so
          Debug stays here as a small owner-only desktop footer. */}
      {isOwner ? (
        <p
          data-testid="dashboard-debug-footer"
          className="mt-10 hidden text-center font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400 sm:block"
        >
          <Link
            href="/app/debug"
            className="inline-flex items-center gap-1.5 hover:text-brand"
          >
            <Bug size={12} weight="bold" />
            Owner debug
          </Link>
        </p>
      ) : null}
    </>
  );
}

/**
 * Wave 13 — lifecycle-aware dashboard aggregates.
 *
 * Counts every non-deleted quote owned by the caller, bucketed by
 * status. The set of stages shown on the dashboard is `DASHBOARD_STAGES`
 * below — kept short so the tile row fits on a phone. Declined/expired
 * still get counted in `byStage` so /app/quotes filters can use the
 * same shape, but they don't appear as primary tiles.
 */
const DASHBOARD_STAGES: readonly QuoteStatus[] = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
];

interface LifecycleStats {
  totalQuotes: number;
  thisMonth: number;
  totalAmount: number;
  /** Sum of `total_amount` for quotes created this calendar month. */
  thisMonthAmount: number;
  /** Sum of `total_amount` for quotes that have moved past "sent" into
   *  accepted / scheduled / in_progress / completed — the locked-in
   *  revenue figure that drives the "Accepted" KPI card. */
  acceptedAmount: number;
  currency: string;
  byStage: Record<QuoteStatus, number>;
}

function computeLifecycleStats(
  rows: Array<{
    status: QuoteStatus | null;
    total_amount: number | string | null;
    currency: string | null;
    created_at: string;
  }>,
): LifecycleStats {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let thisMonth = 0;
  let thisMonthAmount = 0;
  let acceptedAmount = 0;
  let totalAmount = 0;
  let currency = "NZD";
  const byStage: Record<QuoteStatus, number> = {
    draft: 0,
    sent: 0,
    viewed: 0,
    accepted: 0,
    scheduled: 0,
    in_progress: 0,
    completed: 0,
    declined: 0,
    expired: 0,
  };
  // Stages that count as "locked in" revenue for the Xero-style
  // "Accepted" KPI. Sent / viewed are excluded — they haven't been
  // accepted yet. Declined / expired are excluded — they're lost.
  const LOCKED_IN: ReadonlySet<QuoteStatus> = new Set([
    "accepted",
    "scheduled",
    "in_progress",
    "completed",
  ]);
  for (const row of rows) {
    const total = Number(row.total_amount) || 0;
    totalAmount += total;
    if (row.currency) currency = row.currency;
    const stage = (row.status ?? "draft") as QuoteStatus;
    if (stage in byStage) byStage[stage] += 1;
    if (LOCKED_IN.has(stage)) acceptedAmount += total;
    const created = Date.parse(row.created_at);
    if (!Number.isNaN(created) && created >= monthStart) {
      thisMonth += 1;
      thisMonthAmount += total;
    }
  }
  return {
    totalQuotes: rows.length,
    thisMonth,
    totalAmount: round2(totalAmount),
    thisMonthAmount: round2(thisMonthAmount),
    acceptedAmount: round2(acceptedAmount),
    currency,
    byStage,
  };
}

/**
 * One lifecycle stage tile. Acts as a `Link` into the quotes hub with
 * a `?stage=` filter pre-applied, so clicking "Sent · 3" lands on the
 * filtered list view.
 */
function StageTile({
  stage,
  label,
  count,
}: {
  stage: QuoteStatus;
  label: string;
  count: number;
}) {
  const active = count > 0;
  return (
    <Link
      href={`/app/quotes?stage=${stage}`}
      data-testid={`stage-tile-${stage}`}
      data-count={count}
      // Wave 38 — pro stage tile. Softer corners (rounded-lg), quieter
      // borders via white/black alpha, gentle hover lift.
      className={`group flex flex-col gap-0.5 rounded-lg border px-2.5 py-2.5 transition-all sm:gap-1 sm:px-3 sm:py-3 ${
        active
          ? "border-white/[0.06] bg-white/[0.02] hover:border-brand/40 hover:bg-brand/[0.06] hover:-translate-y-px"
          : "border-white/[0.04] bg-white/[0.01] text-ink-500 hover:border-white/[0.08]"
      }`}
    >
      <p
        className={`font-semibold tabular-nums leading-none ${active ? "text-brand" : "text-ink-500"} text-base sm:text-2xl`}
      >
        {count}
      </p>
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-400 sm:text-[10px] sm:tracking-[0.2em]">
        {label}
      </p>
    </Link>
  );
}

/** Secondary KPI strip (Quotes-this-month + Total-quoted). */
function SecondaryStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-3"
    >
      <p className="font-semibold tabular-nums leading-none text-brand text-lg sm:text-xl">
        {value}
      </p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300">
        {label}
      </p>
    </div>
  );
}

function WorkBoardMetric({ label, value, detail, tone, icon }: {
  label: string; value: string; detail: string;
  tone: "teal" | "amber" | "blue"; icon: React.ReactNode;
}) {
  return (
    <div className="t2q-work-metric" data-tone={tone}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold tracking-wide">{label}</p>
        <span className="t2q-work-metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-4 text-xl font-semibold leading-tight text-white">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-[#b7c3c2]">{detail}</p>
    </div>
  );
}

/** Xero-style headline KPI card. Used in the four-up strip above the
 *  pipeline section. `tone` colours the big number for quick scanning:
 *  brand = this-month spotlight; positive = locked-in money; warning =
 *  pending action; neutral = plain count. */
function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "brand" | "positive" | "warning" | "neutral";
}) {
  const valueTone =
    tone === "brand"
      ? "text-brand"
      : tone === "positive"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-ink-100";
  return (
    <div
      data-testid={`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="t2q-card-pro p-4 sm:p-5"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums sm:text-3xl ${valueTone}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

/** Server-side today as YYYY-MM-DD. In a helper (not the component body)
 *  to satisfy the react-hooks/purity rule for the async server component. */
function serverTodayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatShortDate(dateISO: string): string {
  const value = new Date(`${dateISO}T00:00:00`);
  if (Number.isNaN(value.getTime())) return dateISO;
  return value.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
