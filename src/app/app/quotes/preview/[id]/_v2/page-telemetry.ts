import "server-only";
import { detectForgottenCosts } from "@/lib/agents/forgotten-costs";
import { runComplianceAgent } from "@/lib/agents/compliance";
import { runInvoiceAgent } from "@/lib/agents/invoice";
import { logAgentApprovalNeeded, logAgentEvent } from "@/lib/agent-monitor/logger";
import { orchestrate } from "@/lib/lifecycle/orchestrator";
import {
  checkQuoteReadiness,
  summarizeReadiness,
  type ProfileForReadiness,
} from "@/lib/quote-readiness";
import type { QuoteData, QuoteStatus } from "@/lib/quote-types";

/**
 * The agent-monitor events the classic quote page sends on every render,
 * sent the same way from the new job page so the owner's monitor dashboard
 * keeps its data whichever look is on. Fire-and-forget and failure-proof:
 * every helper is a no-op without AGENT_DASHBOARD_URL / _SECRET, and only
 * ids, counts, statuses and short messages leave (see the logger's PII
 * allow-list). Kept in step with src/app/app/quotes/preview/[id]/page.tsx.
 */
export function logJobPageTelemetry({
  quoteId,
  status,
  quoteData,
  expiresAt,
  voiceTranscript,
  invoiceExists,
  profile,
}: {
  quoteId: string;
  status: QuoteStatus;
  quoteData: QuoteData;
  expiresAt: string | null;
  voiceTranscript: string | null;
  invoiceExists: boolean;
  profile: ProfileForReadiness | null;
}): void {
  try {
    const orchOut = orchestrate({
      status,
      quoteData,
      events: [],
      expiresAt,
      voiceTranscript,
      invoiceExists,
    });
    logAgentEvent({
      agentName: "Lifecycle Orchestrator",
      quoteId,
      stepName: "stage.check",
      status: "complete",
      message: `Stage checked: ${orchOut.stage}`,
    });
    if (orchOut.nextAction) {
      logAgentEvent({
        agentName: "Lifecycle Orchestrator",
        quoteId,
        stepName: "next-action.suggest",
        status: "complete",
        message: `Next action: ${orchOut.nextAction.buttonLabel}`,
      });
    }
    if (orchOut.approvalNeeded) {
      logAgentApprovalNeeded({
        agentName: "Lifecycle Orchestrator",
        quoteId,
        stepName: "approval.needed",
        status: "waiting_approval",
        message: "Owner approval required for next lifecycle action",
      });
    }
  } catch {
    /* never break the render */
  }

  try {
    const sum = summarizeReadiness(checkQuoteReadiness(quoteData, profile, expiresAt));
    logAgentEvent({
      agentName: "Quote Readiness Agent",
      quoteId,
      stepName: "readiness.evaluate",
      status: sum.status === "ready" ? "complete" : sum.status === "review" ? "running" : "failed",
      message:
        sum.status === "ready"
          ? `Ready · ${sum.ready}/${sum.total} complete`
          : `${sum.missing} missing · ${sum.review} warnings · ${sum.ready}/${sum.total} complete`,
    });
  } catch {
    /* never break the render */
  }

  if (voiceTranscript) {
    logAgentEvent({
      agentName: "Voice Cleanup Agent",
      quoteId,
      stepName: "cleanup.suggested",
      status: "pending",
      message: "Transcript present — cleanup available (client-side, no auto-apply)",
    });
  }

  logAgentEvent({
    agentName: "Follow-up Agent",
    quoteId,
    stepName: "copy.generated",
    status: "complete",
    message: `Follow-up copy generated · clipboard-only · status=${status}`,
  });

  try {
    const report = runComplianceAgent(quoteData);
    const aiEngineOn = (quoteData.compliance_review ?? null) !== null;
    logAgentEvent({
      agentName: "Compliance Agent",
      quoteId,
      stepName: "compliance.check",
      status: report.flags.some((f) => f.severity === "high")
        ? "failed"
        : report.flags.length > 0
          ? "running"
          : "complete",
      message: aiEngineOn
        ? `Rule-based: ${report.flags.length} flags, ${report.suggestions.length} suggestions · T2Q engine on`
        : `Rule-based: ${report.flags.length} flags, ${report.suggestions.length} suggestions · T2Q compliance engine off (no compliance_review data)`,
    });
  } catch {
    /* never break the render */
  }

  try {
    const fc = detectForgottenCosts(quoteData);
    logAgentEvent({
      agentName: "Forgotten-Cost Detector",
      quoteId,
      stepName: "scan.complete",
      status: fc.clean ? "complete" : "running",
      message: fc.clean ? "No commonly-missed costs flagged" : `${fc.costs.length} possibly-missed cost(s) flagged`,
    });
  } catch {
    /* never break the render */
  }

  if (status === "completed" && !invoiceExists) {
    try {
      const preview = runInvoiceAgent(status, quoteData);
      if (preview.reason === "ready") {
        logAgentEvent({
          agentName: "Invoice Agent",
          quoteId,
          stepName: "draft.suggested",
          status: "pending",
          message: `Draft invoice suggested (Draft only) · ${preview.lineItemCount} lines · ${preview.currency}`,
        });
      }
    } catch {
      /* never break the render */
    }
  }
}
