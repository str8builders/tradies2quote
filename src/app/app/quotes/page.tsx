import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { quoteNumber } from "@/lib/quote-defaults";
import type { QuoteStatus } from "@/lib/quote-types";
import { STAGE_LABELS, STAGES } from "@/lib/lifecycle/stages";
import { isNewLookOn } from "@/lib/ui/newLook";
import { jobsFilterForQuoteStage, jobsHref } from "../_v2/lib/job-board";
import { AppHeader } from "../_components/AppHeader";
import {
  QuotesListClient,
  type QuoteListRow,
} from "../_components/QuotesListClient";

export const metadata: Metadata = {
  title: "Quotes",
};

export const dynamic = "force-dynamic";

/**
 * Wave 13 — lifecycle stage filter via `?stage=`. The dashboard's
 * stage tiles deep-link here, so each stage gets its own quote list
 * view. The QuotesListClient already provides client-side filtering;
 * this server-side `?stage=` filter narrows the row set BEFORE
 * shipping it, which keeps the wire payload small for big inboxes.
 */
const VALID_STAGES = new Set<QuoteStatus>(STAGES);

function parseStage(raw: string | undefined): QuoteStatus | null {
  if (!raw) return null;
  return VALID_STAGES.has(raw as QuoteStatus) ? (raw as QuoteStatus) : null;
}

/**
 * /app/quotes — full quote-management hub.
 *
 * Loads up to 100 of the user's most recent quotes (excluding those soft-
 * deleted), passes them to the `<QuotesListClient />` which handles
 * search, status-filter tabs, archive/restore/delete actions, and
 * Load-more pagination client-side.
 *
 * Why server-side filter on `deleted_at` only and not on `archived_at`:
 * the Archived filter tab needs to fetch archived rows too. Excluding
 * deleted rows server-side keeps malicious / abandoned data out of the
 * client; partitioning Active vs Archived stays client-side so the user
 * doesn't have to refetch when toggling tabs.
 */
const PAGE_FETCH_LIMIT = 100;

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { stage: stageRaw } = await searchParams;
  // Redesign: quotes and invoices are one Jobs list in the new look.
  if (await isNewLookOn()) redirect(jobsHref(jobsFilterForQuoteStage(stageRaw)));
  const stageFilter = parseStage(stageRaw);

  // Wave 46 perf — this used to select the whole `quote_data` JSONB blob
  // (pricing breakdown, terms, every line item, AI meta…) for up to 100
  // rows just to read the job summary and client name below. PostgREST's
  // JSON-path select lets Postgres do that narrowing instead of shipping
  // the full document over the wire.
  // `line_items` is kept as the JSON array (rather than indexing to its
  // first element in the select string) so this only relies on the
  // well-established `column->path` / `column->>path` PostgREST syntax —
  // the fallback below still reads only its first description client-side.
  let query = supabase
    .from("quotes")
    .select(
      "id, status, total_amount, currency, created_at, archived_at, job_summary:quote_data->>job_summary, client_name:quote_data->client->>name, line_items:quote_data->line_items",
    )
    .eq("user_id", user.id)
    .is("deleted_at", null);

  // Wave 13 — server-side stage filter. The QuotesListClient still
  // offers its own client-side status tabs; this filter narrows the
  // dataset upstream when the user lands via a dashboard tile link.
  if (stageFilter) {
    query = query.eq("status", stageFilter);
  }

  // Requests from the public "Request a quote" link that still sit as
  // drafts — surfaced here until the tradie deals with them.
  const { count: openRequestCount } = await supabase
    .from("quote_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", ["new", "generated", "generation_failed"]);

  const { data: rows } = await query
    .order("created_at", { ascending: false })
    .limit(PAGE_FETCH_LIMIT);

  const list: QuoteListRow[] = (rows ?? []).map((q) => {
    const lineItems = q.line_items as Array<{ description?: string }> | null;
    const jobSummary =
      (q.job_summary as string | undefined) ??
      (lineItems?.[0]?.description as string | undefined) ??
      "";
    return {
      id: q.id,
      status: (q.status ?? "draft") as QuoteStatus,
      total: Number(q.total_amount) || 0,
      currency: (q.currency as string) ?? "NZD",
      clientName: (q.client_name as string | undefined) ?? "—",
      jobSummary,
      number: quoteNumber(q.id, q.created_at),
      created_at: q.created_at,
      archived_at: q.archived_at,
    };
  });

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Quotes" />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="t2q-page-intro mb-8">
          <div className="t2q-section-label-pro mb-3">{"// your quote library"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Quotes.
          </h1>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Search, filter, archive — everything you&apos;ve quoted, billed, or
            chased lives here.
          </p>
        </div>

        {openRequestCount ? (
          <Link
            href="/app/requests"
            data-testid="open-requests-banner"
            className="t2q-card-pro t2q-card-pro-hover mb-5 flex items-center justify-between gap-3 p-4"
          >
            <span className="text-sm text-ink-100">
              <span className="font-display uppercase tracking-tight text-brand">
                {openRequestCount} client request{openRequestCount === 1 ? "" : "s"}
              </span>{" "}
              waiting from your request link.
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-300">View</span>
          </Link>
        ) : null}

        {/* Wave 13 — stage filter pill, only visible when the page is
            entered via `?stage=`. Lets the owner clear the filter and
            see the full list without going back to the dashboard. */}
        {stageFilter ? (
          <div
            data-testid="stage-filter-banner"
            className="mb-5 flex flex-wrap items-center gap-3 rounded-sm border border-brand/40 bg-brand/5 p-3"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              {"// filtering by stage"}
            </p>
            <span className="inline-flex items-center rounded-sm border border-brand/40 bg-brand/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              {STAGE_LABELS[stageFilter]}
            </span>
            <Link
              href="/app/quotes"
              data-testid="stage-filter-clear"
              className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
            >
              clear filter
            </Link>
          </div>
        ) : null}

        <QuotesListClient rows={list} isHub />
      </main>
    </div>
  );
}
