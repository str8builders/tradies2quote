import { redirect } from "next/navigation";
import { runFollowupAgent } from "@/lib/agents/followup";
import { runInvoiceAgent } from "@/lib/agents/invoice";
import { parseVerificationReport } from "@/lib/agents/verify/report";
import { logAgentEvent } from "@/lib/agent-monitor/logger";
import { businessNameForDocuments } from "@/lib/business-name";
import type { ComplianceLineItem, ComplianceReview } from "@/lib/compliance";
import { isQuoteLocked } from "@/lib/lifecycle/lock";
import { quoteNumber } from "@/lib/quote-defaults";
import { classifyPublicQuote } from "@/lib/quote-public-view";
import type { QuoteData, QuoteStatus } from "@/lib/quote-types";
import { loadQuoteVideoStatus, quoteVideoShareText } from "@/lib/quote-video/owner";
import { guardQuoteForReview } from "@/lib/reviewGuard";
import { smsConfigured } from "@/lib/sms-quote";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { QuoteReadinessCheck } from "../../../../_components/QuoteReadinessCheck";
import { ComplianceAgent } from "../../../../_components/agents/ComplianceAgent";
import { FollowupAgent } from "../../../../_components/agents/FollowupAgent";
import { ForgottenCostsAgent } from "../../../../_components/agents/ForgottenCostsAgent";
import { VerificationPanel } from "../../../../_components/agents/VerificationPanel";
import { VoiceCleanupAgent } from "../../../../_components/agents/VoiceCleanupAgent";
import { CompliancePanel } from "../_components/CompliancePanel";
import { CustomerChatPanel } from "../_components/CustomerChatPanel";
import { TranscriptPanel, type TranscriptPanelData } from "../_components/TranscriptPanel";
import { bookedDateKey, bookedDayLabel, invoiceState, isPastExpiry, shortDate } from "./dates";
import { GeneratingScreen } from "./GeneratingScreen";
import { JobScreen } from "./JobScreen";
import { logJobPageTelemetry } from "./page-telemetry";
import type { DayNote, JobInvoice, ServerTool } from "./types";

/**
 * The new-look job page (redesign phase 3), shown instead of the classic
 * quote page when isNewLookOn() is true. Loads what the classic page loads,
 * through the same RLS-scoped client, and hands it to <JobScreen>. Every
 * change goes back through the classic page's server actions and routes.
 */
export async function JobPageV2({ id }: { id: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, voice_transcript, quote_data, created_at, status, public_token, pdf_path, sent_at, viewed_at, accepted_at, expires_at, chat_disabled, version, scheduled_for",
    )
    .eq("id", id)
    .single();
  if (error || !quote) redirect("/app/quotes/new");

  const number = quoteNumber(quote.id, quote.created_at);
  const status = (quote.status ?? "draft") as QuoteStatus;

  // Same review guard as the classic page: only a quote_data with a
  // line_items array counts as written; unsupported lines are left out of
  // what the page shows (and said so), never silently.
  const stored = (quote.quote_data ?? null) as QuoteData | null;
  const rawQuoteData = stored && Array.isArray(stored.line_items) ? stored : null;
  const guard = rawQuoteData
    ? guardQuoteForReview(rawQuoteData, { description: quote.voice_transcript ?? rawQuoteData.job_summary })
    : null;
  const quoteData = guard?.data ?? rawQuoteData;

  if (!quoteData) return <GeneratingScreen quoteId={quote.id} quoteNumber={number} />;

  if (guard && guard.stripped.length > 0) {
    console.warn("[review-guard] stripped lines", { quoteId: quote.id, stripped: guard.stripped });
    logAgentEvent({
      agentName: "Review Guard",
      runId: `review-guard-${quote.id}`,
      stepName: "strip",
      status: "complete",
      message: guard.stripped
        .map((s) => `${s.reason}: ${s.description}`)
        .join(" | ")
        .slice(0, 280),
      quoteId: quote.id,
    });
  }

  const [{ data: profile }, { data: invoiceRow }, { data: libraryRows }] = await Promise.all([
    supabase.from("profiles").select("business_name, email, phone, address").eq("id", user.id).maybeSingle(),
    supabase
      .from("invoices")
      .select("id, invoice_number, status, total_amount, currency, due_date, created_at, sent_at, paid_at")
      .eq("quote_id", id)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .maybeSingle(),
    supabase.from("materials").select("id, name, unit, default_unit_price").eq("user_id", user.id),
  ]);

  // Worked out once, here, so the phone never renders a different day.
  const now = new Date();

  const invoice: JobInvoice | null = invoiceRow
    ? {
        id: invoiceRow.id,
        total: Number(invoiceRow.total_amount) || 0,
        currency: invoiceRow.currency ?? quoteData.currency ?? "NZD",
        ...invoiceState(
          {
            status: invoiceRow.status as InvoiceStatus,
            invoice_number: invoiceRow.invoice_number,
            due_date: invoiceRow.due_date,
            paid_at: invoiceRow.paid_at,
          },
          now,
        ),
      }
    : null;

  // The quote video, only while the quote is still an offer (as on the
  // classic page); hidden if its status can't be read.
  let video: Awaited<ReturnType<typeof loadQuoteVideoStatus>> | null = null;
  if (!isQuoteLocked(quote.status)) {
    try {
      video = await loadQuoteVideoStatus(supabase, adminClient(), user.id, quote.id);
    } catch {
      video = null;
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tradies2quote.com";
  const publicView = classifyPublicQuote({ status, expires_at: quote.expires_at ?? null }, now).kind;
  const publicLink =
    quote.public_token && (publicView === "live" || publicView === "accepted")
      ? `${appUrl.replace(/\/+$/, "")}/quote/${quote.public_token}`
      : null;

  const bookedDate = bookedDateKey(quote.scheduled_for);
  let dayNotes: DayNote[] = [];
  if (bookedDate) {
    const { data: notes } = await supabase
      .from("calendar_notes")
      .select("id, body")
      .eq("user_id", user.id)
      .eq("note_date", bookedDate)
      .order("created_at", { ascending: true });
    dayNotes = (notes ?? []).map((n) => ({ id: n.id, body: n.body }));
  }

  // The follow-up the classic Follow-up Agent recommends right now.
  let reminder: { label: string; body: string } | null = null;
  if (status === "sent" || status === "viewed") {
    const messages = runFollowupAgent({
      quoteNumber: number,
      clientName: quoteData.client?.name ?? null,
      total: quoteData.total ?? 0,
      currency: quoteData.currency || "NZD",
      status,
      sentAtIso: quote.sent_at ?? null,
      businessName: profile?.business_name ?? null,
    });
    const pick = messages.find((m) => m.recommended) ?? messages.find((m) => m.id === "friendly-reminder");
    reminder = pick ? { label: pick.label, body: pick.body } : null;
  }

  const invoiceBlockers =
    status === "completed" && !invoice ? runInvoiceAgent(status, quoteData).blockers : [];

  logJobPageTelemetry({
    quoteId: quote.id,
    status,
    quoteData,
    expiresAt: quote.expires_at ?? null,
    voiceTranscript: quote.voice_transcript ?? null,
    invoiceExists: invoice !== null,
    profile: profile ?? null,
  });

  const serverTools: ServerTool[] = [
    {
      id: "chat",
      title: "Customer chat",
      subtitle: "What your client asked on the quote link",
      content: (
        <CustomerChatPanel quoteData={quoteData} quoteId={quote.id} chatDisabled={quote.chat_disabled === true} />
      ),
    },
    {
      id: "review",
      title: "Check the quote",
      subtitle: "Anything missing before it goes",
      content: (
        <>
          <QuoteReadinessCheck quoteData={quoteData} profile={profile ?? null} expiresAt={quote.expires_at ?? null} />
          {(() => {
            const report = parseVerificationReport(quoteData.verification);
            return report ? <VerificationPanel report={report} /> : null;
          })()}
        </>
      ),
    },
    {
      id: "missed-costs",
      title: "Commonly missed costs",
      subtitle: "Things jobs like this often leave out",
      content: <ForgottenCostsAgent quoteData={quoteData} />,
    },
    {
      id: "compliance",
      title: "Compliance checks",
      content: (
        <>
          <ComplianceAgent quoteData={quoteData} />
          {quoteData.compliance_review ? (
            <CompliancePanel
              quoteId={quote.id}
              review={quoteData.compliance_review as ComplianceReview}
              items={quoteData.line_items as ComplianceLineItem[]}
            />
          ) : null}
        </>
      ),
    },
    {
      id: "follow-up",
      title: "Follow-up messages",
      subtitle: "Ready to copy into a text or email",
      content: (
        <FollowupAgent
          quoteNumber={number}
          clientName={quoteData.client?.name ?? null}
          total={quoteData.total ?? 0}
          currency={quoteData.currency || "NZD"}
          status={status}
          sentAtIso={quote.sent_at ?? null}
          businessName={profile?.business_name ?? null}
        />
      ),
    },
  ];
  const transcript = (quoteData.transcript ?? null) as TranscriptPanelData | null;
  if (transcript) {
    serverTools.push({
      id: "transcript",
      title: "What you said",
      subtitle: "The job as you described it",
      content: (
        <TranscriptPanel
          quoteId={quote.id}
          transcript={transcript}
          status={status}
          lineCount={quoteData.line_items.length}
        />
      ),
    });
  }
  if (quote.voice_transcript) {
    serverTools.push({
      id: "voice-cleanup",
      title: "Tidy up your recording",
      content: <VoiceCleanupAgent transcript={quote.voice_transcript} />,
    });
  }

  return (
    <JobScreen
      quoteId={quote.id}
      quoteNumber={number}
      status={status}
      data={quoteData}
      stripped={(guard?.stripped ?? []).map((s) => s.description)}
      description={quote.voice_transcript ?? quoteData.job_summary ?? null}
      publicLink={publicLink}
      hasPdf={quote.pdf_path !== null && quote.pdf_path !== undefined}
      pastExpiry={isPastExpiry(quote.expires_at, now)}
      dates={{
        sentOn: shortDate(quote.sent_at),
        viewedOn: shortDate(quote.viewed_at),
        acceptedOn: shortDate(quote.accepted_at),
        bookedFor: bookedDayLabel(bookedDate),
        expiresOn: shortDate(quote.expires_at),
      }}
      bookedDate={bookedDate}
      invoice={invoice}
      invoiceBlockers={invoiceBlockers}
      hasBusinessName={businessNameForDocuments(profile?.business_name) !== null}
      smsEnabled={smsConfigured()}
      reminder={reminder}
      library={(libraryRows ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        unit: r.unit,
        default_unit_price: r.default_unit_price !== null ? Number(r.default_unit_price) : null,
      }))}
      video={
        video?.ok
          ? {
              status: video.status,
              version: quote.version,
              shareText: quoteVideoShareText({ status: quote.status, publicToken: quote.public_token ?? null, appUrl }),
            }
          : null
      }
      dayNotes={dayNotes}
      serverTools={serverTools}
    />
  );
}
