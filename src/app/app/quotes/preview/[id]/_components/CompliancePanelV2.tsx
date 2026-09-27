"use client";

import type { ReactNode } from "react";
import { CaretDown, Info, Question, Warning, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { StatusPill } from "@/components/ui/status-pill";
import { TAP, type Tone } from "@/components/ui/styles";
import {
  KNOWLEDGE_SOURCES,
  type ComplianceLineItem,
  type ComplianceReview,
  type ComplianceSourceType,
  type ComplianceWarning,
} from "@/lib/compliance";
import type { ReviewSummary, WarningsByCategory } from "@/lib/compliance/panel-helpers";
import { ClarificationFormV2, type ClarificationFormV2Props } from "./ClarificationFormV2";

// The building-code review in the new look (CompliancePanel look="new"). Same
// statuses, sections, test ids and clarify route as the classic panel, which
// keeps the answers and the save; only the drawing differs, and like the
// classic panel it never blocks sending.

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The review didn't run: say so plainly. */
export function ComplianceUnavailableV2() {
  return (
    <section data-testid="compliance-panel-error">
      <Callout tone="info" title="The building code check didn't run">
        The quote was written, but its materials weren&apos;t checked against the code rules this time. Check them
        yourself before you send.
      </Callout>
    </section>
  );
}

/** Nothing to flag, and where the rules came from. */
export function CompliancePassedV2({ review, showSources }: { review: ComplianceReview; showSources: boolean }) {
  return (
    <section data-testid="compliance-panel-ok" className="space-y-3">
      <Callout tone="ok" title="Building code check passed">
        Every material line was checked against the NZ Building Code rules, and nothing needs changing.
      </Callout>
      {showSources ? <Sources review={review} /> : null}
    </section>
  );
}

function warningWords({ warningCounts: { warning, blocker } }: ReviewSummary): string {
  const total = warning + blocker;
  const save = "You can still save the quote while you decide.";
  if (total === 0) return `The check left some notes below. ${save}`;
  return `${plural(total, "thing")} to review${blocker > 0 ? ` (${blocker} must be fixed)` : ""}. ${save}`;
}

const GROUPS = [
  { key: "insulation", title: "Insulation checks" },
  { key: "treatment", title: "Timber treatment checks" },
  { key: "fastener", title: "Fixing checks" },
  { key: "other", title: "Other code warnings" },
] as const;

/** Questions to answer and/or warnings to read, then the per-line review and sources. */
export function ComplianceReviewV2({
  review,
  items,
  summary,
  grouped,
  form,
}: {
  review: ComplianceReview;
  items: ComplianceLineItem[];
  summary: ReviewSummary;
  grouped: WarningsByCategory;
  form: Omit<ClarificationFormV2Props, "questions">;
}) {
  const needsAnswers = review.status === "needs_clarification";
  return (
    <section data-testid="compliance-panel" className="space-y-4">
      <Callout
        tone="warn"
        icon={needsAnswers ? <Question weight="bold" /> : undefined}
        title={needsAnswers ? "A few questions before you send" : "Worth a look before you send"}
      >
        {needsAnswers
          ? `Answer ${plural(summary.clarificationsCount, "question")} so the rules engine can confirm the code-critical materials. Until then, T2Q's estimates aren't signed off.`
          : warningWords(summary)}
      </Callout>

      {needsAnswers ? <ClarificationFormV2 questions={review.clarifications} {...form} /> : null}

      {GROUPS.map(({ key, title }) =>
        grouped[key].length > 0 ? <WarningGroup key={key} title={title} warnings={grouped[key]} items={items} /> : null,
      )}

      <LineByLine items={items} />

      {summary.citationCount > 0 ? <Sources review={review} /> : null}
    </section>
  );
}

const SEVERITY: Record<ComplianceWarning["severity"], { icon: ReactNode; words: string }> = {
  blocker: { icon: <WarningOctagon weight="fill" className="text-ui-bad" />, words: "Must fix" },
  warning: { icon: <Warning weight="fill" className="text-ui-warn" />, words: "Warning" },
  info: { icon: <Info weight="fill" className="text-ui-info" />, words: "Note" },
};

function WarningGroup({
  title,
  warnings,
  items,
}: {
  title: string;
  warnings: ComplianceWarning[];
  items: ComplianceLineItem[];
}) {
  return (
    <div>
      <h3 className="ui-title text-ui-base text-ui-text">{title}</h3>
      <ul className="mt-2 space-y-2">
        {warnings.map((w, i) => {
          const line = typeof w.line_item_index === "number" ? items[w.line_item_index] : undefined;
          const severity = SEVERITY[w.severity] ?? SEVERITY.info;
          return (
            <li
              key={`${w.title}-${i}`}
              data-testid={`compliance-warning-${i}`}
              className="flex items-start gap-3 rounded-ui-md bg-ui-surface-2 p-3"
            >
              <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 text-[1.25rem]">
                {severity.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <span className="sr-only">{severity.words}: </span>
                  {w.title}
                </p>
                <p className="text-ui-sm">{w.message}</p>
                {line ? <p className="mt-1 text-ui-sm text-ui-muted">Line: {line.description}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Where each line's material decision came from. */
const SOURCE: Record<ComplianceSourceType, { tone: Tone; words: string }> = {
  rule: { tone: "ok", words: "Code rule" },
  catalogue: { tone: "info", words: "Catalogue" },
  user_library: { tone: "info", words: "Your library" },
  ai_estimate: { tone: "neutral", words: "T2Q estimate" },
  missing_context: { tone: "warn", words: "Needs more detail" },
};

function LineByLine({ items }: { items: ComplianceLineItem[] }) {
  const reviewed = items.filter((i) => i.compliance_source_type);
  if (reviewed.length === 0) return null;
  return (
    <div>
      <h3 className="ui-title text-ui-base text-ui-text">Line by line</h3>
      <ul className="mt-2 space-y-2">
        {reviewed.map((line, i) => {
          // Stored data: an unknown kind still shows, in its own words.
          const source: { tone: Tone; words: string } = SOURCE[line.compliance_source_type] ?? {
            tone: "neutral",
            words: line.compliance_source_type,
          };
          return (
            <li
              key={`${line.description}-${i}`}
              data-testid={`compliance-line-${i}`}
              className="rounded-ui-md bg-ui-surface-2 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-semibold break-words">{line.description}</p>
                <StatusPill tone={source.tone} className="shrink-0">
                  {source.words}
                </StatusPill>
              </div>
              {line.reason ? <p className="mt-1 text-ui-sm">{line.reason}</p> : null}
              {line.required_confirmations && line.required_confirmations.length > 0 ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ui-sm text-ui-muted">
                  {line.required_confirmations.map((confirm, r) => (
                    <li key={r}>{confirm}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The cited knowledge sources, folded away like the classic panel's. */
function Sources({ review }: { review: ComplianceReview }) {
  const ids = new Set(review.citations.map((c) => c.source_id));
  const cited = KNOWLEDGE_SOURCES.filter((s) => ids.has(s.id));
  if (cited.length === 0) return null;
  return (
    <details data-testid="compliance-sources" className="group/sources rounded-ui-md border border-ui-line">
      <summary
        className={cx(
          "ui-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-ui-md px-3 font-semibold [&::-webkit-details-marker]:hidden",
          TAP,
        )}
      >
        Sources ({cited.length})
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="shrink-0 text-[1.25rem] text-ui-faint transition-transform duration-ui-fast ease-ui-out group-open/sources:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="space-y-3 border-t border-ui-line p-3">
        {cited.map((s) => (
          <li key={s.id} className="text-ui-sm">
            <p className="font-semibold">{s.name}</p>
            <p className="text-ui-muted">
              {s.version}, {s.reference}
            </p>
            <p className="mt-1">{s.summary}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}
