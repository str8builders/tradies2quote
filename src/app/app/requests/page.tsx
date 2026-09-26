import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen } from "@/components/ui/screen";
import { getCachedAuthUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isNativeShellRequest } from "@/lib/native-shell";
import { requestNoteForApp } from "@/lib/trial-ended";
import { isNewLookOn } from "@/lib/ui/newLook";
import { AppHeader } from "../_components/AppHeader";
import { GenerateRequestButton } from "./_components/GenerateRequestButton";
import { DismissRequestButton } from "./_components/DismissRequestButton";
import {
  canGenerateDraft,
  requestContactLine,
  requestReceivedLabel,
  requestStatus,
  toRequestItem,
  type RequestRow,
} from "./_lib/request-status";
import { RequestsView } from "./_newlook/RequestsView";

export const metadata: Metadata = { title: "Quote requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { user } = await getCachedAuthUser();
  if (!user) redirect("/login");
  const { show } = await searchParams;
  const showDismissed = show === "dismissed";
  // A saved note can talk about the subscription; the iPhone app shows plain words (3.1.3(f)).
  const [inApp, newLook] = await Promise.all([isNativeShellRequest(), isNewLookOn()]);

  const supabase = await createClient();
  let query = supabase
    .from("quote_requests")
    .select(
      "id, quote_id, client_name, client_email, client_phone, site_address, description, status, error_message, created_at, seen_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  query = showDismissed ? query.eq("status", "dismissed") : query.neq("status", "dismissed");
  const { data: requests } = await query;

  const rows = requests ?? [];
  // Opening the list is "seeing" it: new rows get their seen_at stamped.
  const unseen = rows.filter((r) => !r.seen_at).map((r) => r.id);
  if (unseen.length > 0) {
    await supabase.from("quote_requests").update({ seen_at: new Date().toISOString() }).in("id", unseen).eq("user_id", user.id);
  }

  // The truth about a draft is the quote itself: if it has line items the
  // request is ready no matter what the request row recorded (the tradie may
  // have generated from the draft after an automatic run failed).
  const quoteIds = rows.map((r) => r.quote_id).filter((id): id is string => Boolean(id));
  const { data: quoteRows } = quoteIds.length
    ? await supabase.from("quotes").select("id, quote_data, status").in("id", quoteIds)
    : { data: [] as Array<{ id: string; quote_data: unknown; status: string }> };
  const quoteState = new Map(
    (quoteRows ?? []).map((q) => {
      const data = q.quote_data as { line_items?: unknown } | null;
      return [q.id, { hasLines: Array.isArray(data?.line_items), status: q.status }];
    }),
  );

  // Redesign: the same requests and actions in the new look (the top bar
  // comes from <AppHeader>). With the switch off, the page below is unchanged.
  if (newLook) {
    const items = (rows as RequestRow[]).map((r) =>
      toRequestItem(r, r.quote_id ? quoteState.get(r.quote_id) : undefined, (note) => requestNoteForApp(note, inApp)),
    );
    return (
      <Screen data-testid="requests-screen">
        <AppHeader context="Quote requests" />
        <RequestsView items={items} showDismissed={showDismissed} />
      </Screen>
    );
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context="Quote requests" />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="t2q-page-intro mb-8">
          <div className="t2q-section-label-pro mb-3">{"// from your request link"}</div>
          <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
            Quote <span className="text-brand">requests.</span>
          </h1>
          <p className="mt-3 text-sm text-ink-300">
            Jobs clients have sent through your public link. Each one is a draft quote on your
            account — open it, check the numbers, and send.
          </p>
        </div>

        <p className="mb-4 text-xs">
          {showDismissed
            ? <Link href="/app/requests" className="text-brand underline-offset-4 hover:underline">Back to open requests</Link>
            : <Link href="/app/requests?show=dismissed" className="text-ink-400 underline-offset-4 hover:underline" data-testid="requests-show-dismissed">Show dismissed requests</Link>}
        </p>

        {rows.length === 0 ? (
          <section className="t2q-card-pro p-5 sm:p-6">
            <p className="text-sm text-ink-300">
              {showDismissed ? "No dismissed requests." : <>Nothing yet. Turn on your request link in{" "}
              <Link href="/app/settings" className="text-brand underline-offset-4 hover:underline">
                Settings
              </Link>{" "}
              and share it with clients.</>}
            </p>
          </section>
        ) : (
          <ul className="space-y-4" data-testid="request-list">
            {rows.map((r) => (
              <li key={r.id} className="t2q-card-pro p-5 sm:p-6" data-unseen={!r.seen_at}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg uppercase tracking-tight">{!r.seen_at ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-hivis align-middle" aria-label="New" /> : null}{r.client_name}</h2>
                    <p className="text-xs text-ink-400">
                      {requestContactLine(r)}
                    </p>
                  </div>
                  <span className="rounded-sm border border-ink-600 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.15em] text-ink-300">
                    {requestStatus(r, r.quote_id ? quoteState.get(r.quote_id) : undefined).label}
                  </span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-200">{r.description}</p>
                {r.error_message ? (
                  <p className="mt-2 text-xs text-hivis">{requestNoteForApp(r.error_message, inApp)}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-ink-500">
                    {requestReceivedLabel(r.created_at)}
                  </span>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <DismissRequestButton id={r.id} dismissed={r.status === "dismissed"} />
                    {r.quote_id && canGenerateDraft(r, quoteState.get(r.quote_id)) ? (
                      <GenerateRequestButton quoteId={r.quote_id} />
                    ) : null}
                    {r.quote_id ? (
                      <Link href={`/app/quotes/preview/${r.quote_id}`} className="t2q-btn-primary-pro">
                        Open draft quote
                      </Link>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
