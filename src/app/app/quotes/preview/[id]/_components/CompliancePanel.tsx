"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  Info,
  Question,
  WarningCircle,
  WarningOctagon,
} from "@phosphor-icons/react";
import {
  KNOWLEDGE_SOURCES,
  type ComplianceLineItem,
  type ComplianceReview,
  type ComplianceWarning,
} from "@/lib/compliance";
import {
  answersToWallContext,
  emptyAnswers,
  groupWarningsByCategory,
  summariseReview,
  type ClarificationAnswers,
} from "@/lib/compliance/panel-helpers";
import { ClarificationForm } from "./ClarificationForm";

/**
 * Compliance review panel rendered into the quote preview page.
 *
 * Render rules:
 *   - `review` is null/undefined        → render nothing (engine was OFF
 *                                          when this quote generated)
 *   - status === "disabled"             → render nothing
 *   - status === "ok"                   → small "review passed" badge
 *   - status === "warnings_only"        → warnings sections + summary
 *   - status === "needs_clarification"  → prominent hero + form + warnings
 *   - status === "error"                → small "review unavailable" notice
 *                                          (NEVER blocks send — failsafe)
 *
 * The panel exists ONLY on the dashboard preview page. The public
 * customer-facing quote page (`/quote/[token]`) reads via the Supabase
 * RPC which projects only the 6-field `PublicLineItem` shape, so none
 * of the metadata rendered here can leak.
 */

type Props = {
  quoteId: string;
  review: ComplianceReview;
  /**
   * The line items as enriched by the engine (with optional compliance
   * metadata folded on). Identical to `review.items` in shape — passed
   * separately so the preview page can render it consistently with the
   * editor's order.
   */
  items: ComplianceLineItem[];
};

export function CompliancePanel({ quoteId, review, items }: Props) {
  const router = useRouter();
  const summary = useMemo(() => summariseReview(review), [review]);
  const grouped = useMemo(
    () => groupWarningsByCategory(review.warnings),
    [review.warnings],
  );
  const [answers, setAnswers] = useState<ClarificationAnswers>(() =>
    emptyAnswers(review.clarifications),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (review.status === "disabled") return null;

  if (review.status === "error") {
    return (
      <section
        data-testid="compliance-panel-error"
        className="rounded-sm border border-ink-700 bg-ink-800 p-4 text-sm text-ink-300"
      >
        <div className="flex items-center gap-2">
          <Info size={16} weight="bold" className="text-ink-400" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            {"// compliance review unavailable"}
          </span>
        </div>
        <p className="mt-2">
          The compliance review didn&rsquo;t run cleanly for this quote — quote generation succeeded but
          T2Q&rsquo;s assumptions weren&rsquo;t double-checked against the rules engine. Review materials
          manually before sending.
        </p>
      </section>
    );
  }

  if (review.status === "ok") {
    return (
      <section
        data-testid="compliance-panel-ok"
        className="rounded-sm border border-brand/30 bg-brand/5 p-4"
      >
        <div className="flex items-center gap-2">
          <CheckCircle size={18} weight="bold" className="text-brand" />
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand">
            {"// compliance review passed"}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-300">
          The rules engine reviewed every material line against NZ Building Code clauses and found no issues.
        </p>
        {summary.citationCount > 0 && <SourcesSection review={review} />}
      </section>
    );
  }

  // status === "needs_clarification" or "warnings_only"
  const handleSubmitAnswers = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const wall = answersToWallContext(answers);
      const res = await fetch(`/api/quotes/${quoteId}/compliance/clarify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wall }),
        // LLM-backed — same stall guard as the core generate flow.
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to save clarifications");
      }
      // Refresh the page — the server component re-reads quote_data and
      // re-renders the panel with the new (hopefully smaller) review.
      router.refresh();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      data-testid="compliance-panel"
      className="space-y-4 rounded-sm border border-hivis/40 bg-hivis/5 p-4"
    >
      <div className="flex items-start gap-3">
        {review.status === "needs_clarification" ? (
          <Question size={20} weight="bold" className="mt-0.5 shrink-0 text-hivis" />
        ) : (
          <WarningCircle
            size={20}
            weight="bold"
            className="mt-0.5 shrink-0 text-hivis"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="t2q-section-label-pro">{"// compliance review"}</p>
          <h2 className="mt-1 font-display text-lg uppercase tracking-tight">
            {review.status === "needs_clarification"
              ? "Needs clarification before send."
              : "Heads-up before send."}
          </h2>
          <p className="mt-1 text-sm text-ink-300">
            {review.status === "needs_clarification"
              ? `${summary.clarificationsCount} ${summary.clarificationsCount === 1 ? "question" : "questions"} need answering so the rules engine can confirm code-critical materials. T2Q estimates aren't being signed off until you confirm.`
              : `${summary.warningCounts.warning + summary.warningCounts.blocker} ${summary.warningCounts.blocker > 0 ? "issue(s) including blockers" : "warning(s)"} need review. Quote can still be saved while you decide.`}
          </p>
        </div>
      </div>

      {review.status === "needs_clarification" && (
        <ClarificationForm
          questions={review.clarifications}
          answers={answers}
          onChange={setAnswers}
          onSubmit={handleSubmitAnswers}
          submitting={submitting}
          submitError={submitError}
        />
      )}

      {grouped.insulation.length > 0 && (
        <WarningSection title="Insulation checks" warnings={grouped.insulation} items={items} />
      )}
      {grouped.treatment.length > 0 && (
        <WarningSection
          title="H-class treatment checks"
          warnings={grouped.treatment}
          items={items}
        />
      )}
      {grouped.fastener.length > 0 && (
        <WarningSection title="Fixing checks" warnings={grouped.fastener} items={items} />
      )}
      {grouped.other.length > 0 && (
        <WarningSection title="Other code warnings" warnings={grouped.other} items={items} />
      )}

      <PerLineMetadataSection items={items} />

      {summary.citationCount > 0 && <SourcesSection review={review} />}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function severityIcon(severity: ComplianceWarning["severity"]) {
  if (severity === "blocker")
    return <WarningOctagon size={14} weight="bold" className="text-red-400" />;
  if (severity === "warning")
    return <WarningCircle size={14} weight="bold" className="text-hivis" />;
  return <Info size={14} weight="bold" className="text-ink-400" />;
}

function WarningSection({
  title,
  warnings,
  items,
}: {
  title: string;
  warnings: ComplianceWarning[];
  items: ComplianceLineItem[];
}) {
  return (
    <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
      <p className="t2q-section-label-pro mb-2">{`// ${title.toLowerCase()}`}</p>
      <ul className="space-y-2">
        {warnings.map((w, i) => {
          const li =
            typeof w.line_item_index === "number"
              ? items[w.line_item_index]
              : undefined;
          return (
            <li
              key={`${w.title}-${i}`}
              data-testid={`compliance-warning-${i}`}
              className="flex items-start gap-2 text-sm"
            >
              <span className="mt-0.5">{severityIcon(w.severity)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{w.title}</p>
                <p className="text-ink-300">{w.message}</p>
                {li && (
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                    {"// "}
                    line: {li.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PerLineMetadataSection({ items }: { items: ComplianceLineItem[] }) {
  const linesWithMeta = items.filter((i) => i.compliance_source_type);
  if (linesWithMeta.length === 0) return null;

  return (
    <div className="rounded-sm border border-ink-700 bg-ink-900/60 p-3">
      <p className="t2q-section-label-pro mb-2">{"// per-line review"}</p>
      <ul className="space-y-2">
        {linesWithMeta.map((li, i) => (
          <li
            key={`${li.description}-${i}`}
            data-testid={`compliance-line-${i}`}
            className="rounded-sm border border-ink-700/60 bg-ink-800/40 p-2 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-semibold text-white">{li.description}</span>
              <SourceTypeBadge type={li.compliance_source_type!} />
            </div>
            {li.reason && <p className="mt-1 text-ink-300">{li.reason}</p>}
            {li.required_confirmations && li.required_confirmations.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-ink-400">
                {li.required_confirmations.map((rc, ridx) => (
                  <li key={ridx}>{rc}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceTypeBadge({
  type,
}: {
  type: NonNullable<ComplianceLineItem["compliance_source_type"]>;
}) {
  const styles: Record<typeof type, string> = {
    rule: "border-brand/40 bg-brand/10 text-brand",
    catalogue: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    user_library: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    ai_estimate: "border-ink-600 bg-ink-800 text-ink-300",
    missing_context: "border-hivis/40 bg-hivis/10 text-hivis",
  };
  const label: Record<typeof type, string> = {
    rule: "rule",
    catalogue: "catalogue",
    user_library: "user library",
    ai_estimate: "ai estimate",
    missing_context: "missing context",
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] ${styles[type]}`}
    >
      {label[type]}
    </span>
  );
}

function SourcesSection({ review }: { review: ComplianceReview }) {
  const cited = useMemo(() => {
    const ids = new Set(review.citations.map((c) => c.source_id));
    return KNOWLEDGE_SOURCES.filter((s) => ids.has(s.id));
  }, [review.citations]);

  if (cited.length === 0) return null;

  return (
    <details
      className="rounded-sm border border-ink-700 bg-ink-900/60 p-3"
      data-testid="compliance-sources"
    >
      <summary className="cursor-pointer text-sm font-semibold text-white">
        Sources ({cited.length})
      </summary>
      <ul className="mt-2 space-y-2">
        {cited.map((s) => (
          <li key={s.id} className="text-xs text-ink-300">
            <p className="font-semibold text-white">{s.name}</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              {s.version} · {s.reference}
            </p>
            <p className="mt-1">{s.summary}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
