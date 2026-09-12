import { QuotePhotos } from "@/app/_components/quote/QuotePhotos";
import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { formatCurrency, quoteNumber } from "@/lib/quote-defaults";
import { isLinkPreviewBot } from "@/lib/bot-detection";
import { PublicQuoteSummary } from "./_components/PublicQuoteSummary";
import { AcceptForm } from "./_components/AcceptForm";
import { AcceptedView } from "./_components/AcceptedView";
import { ExpiredView } from "./_components/ExpiredView";
import { CustomerChat } from "./_components/CustomerChat";
import { getQuoteDepositInfo } from "@/lib/payments";
import { PayDepositButton } from "./_components/PayDepositButton";
import { classifyPublicQuote, isRichPreviewEligible } from "@/lib/quote-public-view";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { token: string };

/**
 * One RPC per request, shared by `generateMetadata` and the page component —
 * React's `cache` dedupes within a request. Returns `{ data, error }` (not just
 * the payload) so the page keeps the EXACT rpc-miss branch the 2026-07-17
 * draft-token outage postmortem hardened.
 */
const getQuoteByToken = cache(async (token: string) => {
  const admin = adminClient();
  const { data, error } = await admin.rpc(
    "get_quote_by_token",
    { p_token: token } as never,
  );
  return {
    data: (data as PublicQuotePayload | null) ?? null,
    error: error ?? null,
  };
});

/**
 * Per-quote link preview (request b). Replaces the site-wide marketing OG card
 * ("Voice in. Quote out.") — which looked like an ad on the client's phone —
 * with the tradie's own business name + the quote total. The generated preview
 * image lives in `opengraph-image.tsx` (same segment) and Next merges it in.
 * Stays `noindex` — these bearer-token links must never be search-indexed.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { token } = await params;
  const robots = { index: false, follow: false };
  const { data: quote } = await getQuoteByToken(token);
  // Only enrich the preview for quotes the page BODY actually renders in full
  // (live = sent/viewed, or accepted). For draft/declined/expired the body
  // hides all figures ("unsent quotes never leak BY DESIGN" — 2026-07-17
  // postmortem), so the unfurl card must stay neutral too, or the business
  // name + total would leak via the meta tags for a quote the page won't show.
  if (!quote || !isRichPreviewEligible(quote, new Date())) {
    return { title: "Quote", robots };
  }

  const business = quote.business_name?.trim() || "your tradie";
  const total = formatCurrency(quote.total, quote.currency);
  const number = quoteNumber(quote.id, quote.created_at);
  const title = `Quote ${number} from ${business}`;
  const description = `${total} incl. ${quote.tax_label}. View and accept your quote online.`;

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      type: "website",
      url: `/quote/${token}`,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PublicQuotePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const { paid: paidParam } = await searchParams;
  const admin = adminClient();

  // Mark viewed (idempotent — RPC no-ops unless first sent → viewed
  // transition). Best-effort telemetry: a failure here must never take
  // down the customer's quote view.
  //
  // SKIPPED for link-preview crawlers: when the tradie texts the link,
  // iMessage/WhatsApp/etc. fetch the page to build the unfurl card BEFORE the
  // client taps it. Marking viewed on that fetch would flip the quote to
  // "viewed" prematurely and poison the follow-up cadence. The crawler still
  // gets the OG tags below — only this write is gated.
  const userAgent = (await headers()).get("user-agent");
  if (!isLinkPreviewBot(userAgent)) {
    try {
      await admin.rpc("mark_quote_viewed", { p_token: token } as never);
    } catch (e) {
      console.error("mark_quote_viewed failed", e);
    }
  }

  // Fetch sanitised payload (deduped with generateMetadata via React cache).
  const { data, error } = await getQuoteByToken(token);
  if (error || !data) {
    // Genuine RPC miss: a bad/missing token or a transport failure. Distinct
    // testid + log (token PREFIX only — the token is the URL's bearer
    // credential) so this is never again conflated with the non-live branch.
    console.error("[public-quote] rpc_miss", {
      tokenPrefix: token.slice(0, 8),
      error: error?.message ?? null,
    });
    return (
      <PageShell>
        <ExpiredView reason="not_found" testId="expired-rpc-miss" />
      </PageShell>
    );
  }

  const quote = data as PublicQuotePayload;
  // Single source of truth for which public view to render (see
  // src/lib/quote-public-view.ts — unit-tested, extracted after the
  // 2026-07-17 draft-token outage).
  const view = classifyPublicQuote(quote, new Date());

  if (view.kind === "accepted") {
    // Deposit-on-accept (flag-gated). Returns null when payments are off or
    // the tradie isn't payment-ready, so the accepted view is unchanged then.
    const deposit = await getQuoteDepositInfo(token);
    const showDeposit = deposit !== null && (deposit.show || paidParam === "1");
    return (
      <PageShell>
        <AcceptedView token={token} quote={quote} />
        <QuotePhotos token={token} />
        {showDeposit ? (
          <PayDepositButton
            token={token}
            amountCents={deposit.amountCents}
            currency={deposit.currency}
            paid={paidParam === "1"}
          />
        ) : null}
      </PageShell>
    );
  }

  // Terminal, un-acceptable states: past its valid-until date, or the
  // tradie marked it declined / expired. Without this branch a declined
  // or expired-status quote would still render a live accept form.
  if (view.kind === "expired") {
    return (
      <PageShell>
        <ExpiredView reason="expired" />
      </PageShell>
    );
  }
  if (view.kind === "unavailable") {
    return (
      <PageShell>
        <ExpiredView reason="unavailable" />
      </PageShell>
    );
  }

  // Only `sent` / `viewed` quotes reach the live accept form. Anything else
  // (classically a `draft` with a token — a texted quote that was never
  // flipped to `sent`) is not_found BY DESIGN so unsent quotes never leak.
  // Logged with a distinct per-status testid so this is never mistaken for
  // an rpc miss again — and the real fix lives in the send flow, which now
  // flips to `sent` at hand-off (see StickyActionBar Open-Messages).
  if (view.kind === "not_live") {
    console.error("[public-quote] non_live_status", {
      id: quote.id,
      status: view.status,
    });
    return (
      <PageShell>
        <ExpiredView reason="not_found" testId={`expired-status-${view.status}`} />
      </PageShell>
    );
  }

  // Guideline 1.2 — the tradie can turn the chat off per quote link (their
  // "block" control). The chat API enforces this with a 403; hiding the
  // launcher here keeps the customer from ever hitting that wall.
  const { data: chatRow } = await admin
    .from("quotes")
    .select("chat_disabled")
    .eq("id", quote.id)
    .maybeSingle();
  const chatEnabled = chatRow?.chat_disabled !== true;

  return (
    <PageShell>
      <PublicQuoteSummary token={token} quote={quote} />
      <QuotePhotos token={token} />
      <AcceptForm token={token} quote={quote} />
      {/* Wave 36 — "The Quote That Sells Itself" chat bubble. Only on
          live (sent/viewed) quotes — the API gates this server-side
          too, but rendering nothing on terminal states keeps the
          accepted/expired views uncluttered. */}
      {chatEnabled ? (
        <CustomerChat
          token={token}
          businessName={quote.business_name}
          clientName={quote.client.name}
        />
      ) : null}
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-900 text-white">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-6 flex items-center gap-2">
          <span className="font-display text-xl uppercase tracking-tight">
            tradies<span className="text-brand">2</span>Quote
          </span>
        </div>
        <div className="space-y-6">{children}</div>
      </main>
    </div>
  );
}
