import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/lib/supabase/server";
import type { LibraryMaterial, QuoteData, QuoteStatus } from "@/lib/quote-types";
import { quoteNumber } from "@/lib/quote-defaults";
import type { ComplianceLineItem, ComplianceReview } from "@/lib/compliance";
import { isOwnerEmail } from "@/lib/owner";
import { smsConfigured } from "@/lib/sms-quote";
import { suggestPriceAgentEnabledFromEnv } from "@/lib/agents/suggestPrice";
import type { InvoiceSummary, InvoiceStatus } from "@/lib/types/invoice";
import { orchestrate } from "@/lib/lifecycle/orchestrator";
import {
  checkQuoteReadiness,
  summarizeReadiness,
} from "@/lib/quote-readiness";
import { runComplianceAgent } from "@/lib/agents/compliance";
import { runInvoiceAgent } from "@/lib/agents/invoice";
import { detectForgottenCosts } from "@/lib/agents/forgotten-costs";
import {
  logAgentApprovalNeeded,
  logAgentEvent,
} from "@/lib/agent-monitor/logger";
import { AppHeader } from "../../../_components/AppHeader";
import { QuoteReadinessCheck } from "../../../_components/QuoteReadinessCheck";
import { ComplianceAgent } from "../../../_components/agents/ComplianceAgent";
import { FollowupAgent } from "../../../_components/agents/FollowupAgent";
import { VoiceCleanupAgent } from "../../../_components/agents/VoiceCleanupAgent";
import { ForgottenCostsAgent } from "../../../_components/agents/ForgottenCostsAgent";
import { QuoteGenerator } from "./_components/QuoteGenerator";
import { QuoteEditor } from "./_components/QuoteEditor";
import { guardQuoteForReview } from "@/lib/reviewGuard";
import { CompliancePanel } from "./_components/CompliancePanel";
import { LifecycleCard } from "./_components/LifecycleCard";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import { InvoiceDraftCard } from "./_components/InvoiceDraftCard";
import { ReviewToolsSheet } from "./_components/ReviewToolsSheet";
import {
  TranscriptPanel,
  type TranscriptPanelData,
} from "./_components/TranscriptPanel";
import { CustomerChatPanel } from "./_components/CustomerChatPanel";

export const metadata: Metadata = {
  title: "Quote preview",
};

type Params = { id: string };

export default async function QuotePreviewPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: quote, error } = await supabase
    .from("quotes")
    .select(
      "id, voice_transcript, quote_data, created_at, status, public_token, pdf_path, sent_at, viewed_at, accepted_at, expires_at, chat_disabled",
    )
    .eq("id", id)
    .single();

  if (error || !quote) redirect("/app/quotes/new");

  // REVIEW GUARD (render-stage) — provenance + licensing enforcement. Lines
  // with invalid values or machine-origin deck/insulation lines that this
  // job's own evidence never licensed are STRIPPED (and logged below);
  // legacy AI lines are normalized into the explicit confirm workflow. The
  // guard never mutates the stored row — it sanitizes what review renders.
  // Wave 47 — treat a quote_data without a line_items ARRAY as "not
  // generated yet". The self-hosted base schema shipped a `DEFAULT '{}'`
  // on the column (since removed by migration), which made every fresh
  // draft look generated and crashed the editor against an empty object.
  // Shape-checking here keeps any legacy/poisoned row on the generator
  // path instead of a render crash.
  const storedQuoteData = (quote.quote_data ?? null) as QuoteData | null;
  const rawQuoteData =
    storedQuoteData && Array.isArray(storedQuoteData.line_items)
      ? storedQuoteData
      : null;
  const guard = rawQuoteData
    ? guardQuoteForReview(rawQuoteData, {
        description: quote.voice_transcript ?? rawQuoteData.job_summary,
      })
    : null;
  const quoteData = guard?.data ?? rawQuoteData;
  if (guard && guard.stripped.length > 0) {
    console.warn("[review-guard] stripped lines", {
      quoteId: quote.id,
      stripped: guard.stripped,
    });
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
  const headerNumber = quoteNumber(quote.id, quote.created_at);

  // Wave 11 — load the user's business profile for the readiness check
  // panel below. Same RLS pattern Settings already uses; same fields
  // the readiness function asks for. Safe to fail silently here.
  const { data: profile } = await supabase
    .from("profiles")
    .select("business_name, email, phone, address")
    .eq("id", user.id)
    .maybeSingle();

  // Wave 14 — load the existing non-deleted, non-cancelled invoice
  // for this quote if one exists. Drives both the LifecycleCard's
  // suggestion suppression and the InvoiceDraftCard's existing-state
  // branch. RLS already scopes to this user; we further filter by
  // quote_id + deleted_at IS NULL + status <> 'cancelled'.
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, total_amount, currency, due_date, created_at")
    .eq("quote_id", id)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .maybeSingle();
  const existingInvoice: InvoiceSummary | null = invoiceRow
    ? {
        id: invoiceRow.id,
        invoice_number: invoiceRow.invoice_number,
        status: invoiceRow.status as InvoiceStatus,
        total_amount: Number(invoiceRow.total_amount) || 0,
        currency: invoiceRow.currency ?? "NZD",
        due_date: invoiceRow.due_date,
        created_at: invoiceRow.created_at,
      }
    : null;

  const { data: libraryRows } = await supabase
    .from("materials")
    .select(
      "id, name, unit, default_unit_price, supplier, supplier_url, notes, usage_count, is_ai_estimated, last_used_at",
    )
    .eq("user_id", user.id);
  const library: LibraryMaterial[] = (libraryRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    default_unit_price:
      r.default_unit_price !== null ? Number(r.default_unit_price) : null,
    supplier: r.supplier,
    supplier_url: r.supplier_url,
    notes: r.notes,
    usage_count: Number(r.usage_count) || 0,
    is_ai_estimated: !!r.is_ai_estimated,
    last_used_at: r.last_used_at,
  }));

  /* --------------------------------------------------------------------
   * Agent observability — fire-and-forget logs to the external monitor
   * dashboard. Each block dual-computes the agent's output server-side
   * so we can post a short safe summary without touching the components
   * below. Only ids, counts, status and short messages are transmitted
   * (see logger PII allow-list).
   *
   * If AGENT_DASHBOARD_URL / AGENT_DASHBOARD_SECRET are unset, every
   * helper is a no-op. Network failures only console.warn.
   * ------------------------------------------------------------------ */
  if (quoteData) {
    const status = (quote.status ?? "draft") as QuoteStatus;

    // 1. Lifecycle Orchestrator — same inputs the LifecycleCard will use.
    try {
      const orchOut = orchestrate({
        status,
        quoteData,
        events: [],
        expiresAt: quote.expires_at ?? null,
        voiceTranscript: quote.voice_transcript ?? null,
        invoiceExists: existingInvoice !== null,
      });
      logAgentEvent({
        agentName: "Lifecycle Orchestrator",
        quoteId: quote.id,
        stepName: "stage.check",
        status: "complete",
        message: `Stage checked: ${orchOut.stage}`,
      });
      if (orchOut.nextAction) {
        logAgentEvent({
          agentName: "Lifecycle Orchestrator",
          quoteId: quote.id,
          stepName: "next-action.suggest",
          status: "complete",
          message: `Next action: ${orchOut.nextAction.buttonLabel}`,
        });
      }
      if (orchOut.approvalNeeded) {
        logAgentApprovalNeeded({
          agentName: "Lifecycle Orchestrator",
          quoteId: quote.id,
          stepName: "approval.needed",
          status: "waiting_approval",
          message: "Owner approval required for next lifecycle action",
        });
      }
    } catch {
      // Pure function shouldn't throw, but defense-in-depth — never
      // let logging break the render.
    }

    // 2. Quote Readiness Agent — count-only summary, no field names.
    try {
      const items = checkQuoteReadiness(
        quoteData,
        profile ?? null,
        quote.expires_at ?? null,
      );
      const sum = summarizeReadiness(items);
      logAgentEvent({
        agentName: "Quote Readiness Agent",
        quoteId: quote.id,
        stepName: "readiness.evaluate",
        status:
          sum.status === "ready"
            ? "complete"
            : sum.status === "review"
              ? "running"
              : "failed",
        message:
          sum.status === "ready"
            ? `Ready · ${sum.ready}/${sum.total} complete`
            : `${sum.missing} missing · ${sum.review} warnings · ${sum.ready}/${sum.total} complete`,
      });
    } catch {
      /* never break render */
    }

    // 3. Voice Cleanup Agent — only "suggested" (the actual cleanup
    //    runs client-side via a button; we cannot log that without a
    //    server action, which is out of scope for this wave).
    if (quote.voice_transcript) {
      logAgentEvent({
        agentName: "Voice Cleanup Agent",
        quoteId: quote.id,
        stepName: "cleanup.suggested",
        status: "pending",
        message: "Transcript present — cleanup available (client-side, no auto-apply)",
      });
    }

    // 4. Follow-up Agent — runs server-side inside <FollowupAgent>,
    //    output is clipboard-only.
    logAgentEvent({
      agentName: "Follow-up Agent",
      quoteId: quote.id,
      stepName: "copy.generated",
      status: "complete",
      message: `Follow-up copy generated · clipboard-only · status=${status}`,
    });

    // 5. Compliance Agent — rule-based pass. If quoteData.compliance_review
    //    is missing, we explicitly note the AI engine is off.
    try {
      const report = runComplianceAgent(quoteData);
      const aiEngineOn = (quoteData.compliance_review ?? null) !== null;
      logAgentEvent({
        agentName: "Compliance Agent",
        quoteId: quote.id,
        stepName: "compliance.check",
        status:
          report.flags.some((f) => f.severity === "high")
            ? "failed"
            : report.flags.length > 0
              ? "running"
              : "complete",
        message: aiEngineOn
          ? `Rule-based: ${report.flags.length} flags, ${report.suggestions.length} suggestions · T2Q engine on`
          : `Rule-based: ${report.flags.length} flags, ${report.suggestions.length} suggestions · T2Q compliance engine off (no compliance_review data)`,
      });
    } catch {
      /* never break render */
    }

    // 6. Forgotten-Cost Detector — rule-based margin-leak scan over the
    //    finished quote. Count + total only; no line descriptions.
    try {
      const fc = detectForgottenCosts(quoteData);
      logAgentEvent({
        agentName: "Forgotten-Cost Detector",
        quoteId: quote.id,
        stepName: "scan.complete",
        status: fc.clean ? "complete" : "running",
        message: fc.clean
          ? "No commonly-missed costs flagged"
          : `${fc.costs.length} possibly-missed cost(s) flagged`,
      });
    } catch {
      /* never break render */
    }

    // 7. Invoice Agent — only emits a log when the quote is completed
    //    and no invoice exists yet (the LifecycleCard's "suggested"
    //    state). Draft only — never sends, never bills.
    if (status === "completed" && existingInvoice === null) {
      try {
        const preview = runInvoiceAgent(status, quoteData);
        if (preview.reason === "ready") {
          logAgentEvent({
            agentName: "Invoice Agent",
            quoteId: quote.id,
            stepName: "draft.suggested",
            status: "pending",
            message: `Draft invoice suggested (Draft only) · ${preview.lineItemCount} lines · ${preview.currency}`,
          });
        }
      } catch {
        /* never break render */
      }
    }
  }

  return (
    <div className="min-h-screen text-white">
      <AppHeader context={headerNumber} />

      <main
        data-preview-quote-number={headerNumber}
        // pb-24 (mobile): the fixed StickyActionBar covers ~3.5rem above the
        // island nav — page-tail cards (Review tools, invoice draft) need
        // their own clearance beyond the shell's global 5.8rem nav padding.
        className="t2q-review-page mx-auto max-w-3xl px-4 pt-6 pb-24 sm:px-6 sm:pt-8 sm:pb-10"
      >
        <div className="mb-5">
          <Link href="/app/quotes" className="t2q-btn-back mb-4">
            <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
            Back to quotes
          </Link>
          <div className="t2q-section-label-pro mb-3">{"// step 2 of 3"}</div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-3xl uppercase tracking-tight sm:text-4xl">
              Review your <span className="text-brand">quote.</span>
            </h1>
            {/* Wave 19.10 — status pill in the header so the operator
                sees the quote's lifecycle stage without scrolling
                down to the sticky bar. Hivis treatment for `draft`
                (attention-grabbing); other statuses keep their
                existing palette via the same map StickyActionBar
                uses. */}
            <HeaderStatusPill status={(quote.status ?? "draft") as QuoteStatus} />
          </div>
          <p className="mt-3 text-sm text-ink-300 sm:text-base">
            Check the total, open any section to edit, then save and send.
          </p>
        </div>

        {quoteData ? (
          <>
            {/* Wave 36 — the passive review-page clarifications banner
                was removed. Replaced by an interactive modal that fires
                during the new-quote flow (before generation), surfacing
                the same signals as a paused question-and-options sheet
                rather than a card the operator could miss. See the
                /api/quotes/cleanup endpoint + ClarificationModal. */}

            {/* REVIEW GUARD notice — strips are never silent. */}
            {guard && guard.stripped.length > 0 ? (
              <p
                data-testid="review-guard-strip-notice"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
              >
                {guard.stripped.length} line(s) were excluded from this review
                because they had no valid source for this job:{" "}
                {guard.stripped.map((s) => s.description).join("; ")}. Add them
                manually if they really belong.
              </p>
            ) : null}

            {/* The total and editor lead; lifecycle and review tools follow. */}
            <QuoteEditor
              quoteId={quote.id}
              createdAt={quote.created_at}
              initialData={quoteData}
              library={library}
              quoteStatus={(quote.status ?? "draft") as QuoteStatus}
              publicToken={quote.public_token ?? null}
              hasPdf={quote.pdf_path !== null && quote.pdf_path !== undefined}
              suggestPriceEnabled={
                suggestPriceAgentEnabledFromEnv() && isOwnerEmail(user.email)
              }
              smsEnabled={smsConfigured()}
            />

            <CollapsibleSection id="quote-job-status" title="Job status & next steps">
            <LifecycleCard
              quoteId={quote.id}
              status={(quote.status ?? "draft") as QuoteStatus}
              quoteData={quoteData}
              expiresAt={quote.expires_at ?? null}
              isOwner={isOwnerEmail(user.email)}
              voiceTranscript={quote.voice_transcript ?? null}
              invoiceExists={existingInvoice !== null}
            />
            </CollapsibleSection>

            {/* Wave 14 — Invoice draft card. Self-hides unless the
                quote is `completed`. The card's id="agent-invoice"
                is what the lifecycle suggestion scrolls to. */}
            <InvoiceDraftCard
              quoteId={quote.id}
              status={(quote.status ?? "draft") as QuoteStatus}
              quoteData={quoteData}
              existingInvoice={existingInvoice}
            />

            {/* Wave 19.10 — review tools collapse behind a single
                "Open review tools" button below md (bottom sheet on
                tap); render inline on md+. ReviewToolsSheet brings
                its own brand-tinted shell + header so the explicit
                <section> wrapper is gone. */}
            <ReviewToolsSheet>
              {/* Wave 36 — customer chat thread first inside the
                  review tools. Tradies need to see customer questions
                  + actionable AI-flagged notes BEFORE the other
                  agents (compliance, readiness, etc.) because the
                  customer's voice is the strongest signal in the
                  pipeline. CollapsibleSection so the read-only thread
                  stays out of the way when there's no chat. */}
              <CollapsibleSection
                id="agent-customer-chat"
                title="Customer chat"
                defaultOpen
              >
                <CustomerChatPanel
                  quoteData={quoteData}
                  quoteId={quote.id}
                  chatDisabled={quote.chat_disabled === true}
                />
              </CollapsibleSection>

              <CollapsibleSection
                id="agent-quote-review"
                title="Quote Review Agent"
              >
                <QuoteReadinessCheck
                  quoteData={quoteData}
                  profile={profile ?? null}
                  expiresAt={quote.expires_at ?? null}
                />
              </CollapsibleSection>

              <CollapsibleSection
                id="agent-forgotten-costs"
                title="Forgotten-Cost Detector"
              >
                <ForgottenCostsAgent quoteData={quoteData} />
              </CollapsibleSection>

              <CollapsibleSection
                id="agent-compliance"
                title="Compliance Agent"
              >
                <ComplianceAgent quoteData={quoteData} />
              </CollapsibleSection>

              {quote.voice_transcript ? (
                <CollapsibleSection
                  id="agent-voice-cleanup"
                  title="Voice Cleanup Agent"
                >
                  <VoiceCleanupAgent
                    transcript={quote.voice_transcript ?? null}
                  />
                </CollapsibleSection>
              ) : null}

              <CollapsibleSection
                id="agent-followup"
                title="Follow-up Agent"
              >
                <FollowupAgent
                  quoteNumber={headerNumber}
                  clientName={quoteData.client?.name ?? null}
                  total={quoteData.total ?? 0}
                  currency={quoteData.currency || "NZD"}
                  status={(quote.status ?? "draft") as QuoteStatus}
                  sentAtIso={quote.sent_at ?? null}
                  businessName={profile?.business_name ?? null}
                />
              </CollapsibleSection>

              {/* Stage 6 transcript panel — only when the generator wrote
                  a transcript object onto quote_data. */}
              {(() => {
                const t = (quoteData.transcript ?? null) as
                  | TranscriptPanelData
                  | null;
                if (!t) return null;
                return (
                  <CollapsibleSection
                    id="agent-transcript"
                    title="Transcript"
                  >
                    <TranscriptPanel
                      quoteId={quote.id}
                      transcript={t}
                      status={(quote.status ?? "draft") as QuoteStatus}
                      lineCount={quoteData.line_items.length}
                    />
                  </CollapsibleSection>
                );
              })()}

              {/* Stage 5 compliance review panel — only when there's a
                  server-side review attached. */}
              {(() => {
                const review = (quoteData.compliance_review ?? null) as
                  | ComplianceReview
                  | null;
                if (!review) return null;
                return (
                  <CollapsibleSection
                    id="agent-compliance-review"
                    title="Compliance Review"
                  >
                    <CompliancePanel
                      quoteId={quote.id}
                      review={review}
                      items={quoteData.line_items as ComplianceLineItem[]}
                    />
                  </CollapsibleSection>
                );
              })()}
            </ReviewToolsSheet>
          </>
        ) : (
          <QuoteGenerator id={quote.id} />
        )}
      </main>
    </div>
  );
}

/**
 * Wave 19.10 — small status pill rendered next to the page H1 so the
 * operator sees the quote's lifecycle stage without scrolling. The
 * `draft` row uses hivis (yellow) to nudge the operator toward the
 * Send action; other statuses keep their existing palette.
 */
function HeaderStatusPill({ status }: { status: QuoteStatus }) {
  const map: Record<QuoteStatus, { label: string; cls: string }> = {
    draft: {
      label: "Draft",
      cls: "border-hivis/40 bg-hivis/10 text-hivis",
    },
    sent: {
      label: "Sent",
      cls: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    },
    viewed: {
      label: "Viewed",
      cls: "border-hivis/40 bg-hivis/10 text-hivis",
    },
    accepted: {
      label: "Accepted",
      cls: "border-brand/40 bg-brand/10 text-brand",
    },
    scheduled: {
      label: "Scheduled",
      cls: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
    },
    in_progress: {
      label: "In progress",
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    },
    completed: {
      label: "Completed",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    },
    declined: {
      label: "Declined",
      cls: "border-red-500/40 bg-red-500/10 text-red-300",
    },
    expired: {
      label: "Expired",
      cls: "border-ink-600 bg-ink-800 text-ink-400",
    },
  };
  const pill = map[status] ?? map.draft;
  return (
    <span
      data-testid="header-status-pill"
      className={`inline-flex items-center rounded-sm border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${pill.cls}`}
    >
      {pill.label}
    </span>
  );
}
