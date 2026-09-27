import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import type { ComplianceReport, ComplianceSeverity, ComplianceSuggestion } from "@/lib/agents/compliance";
import { CopyButton } from "./CopyButton";

const SEVERITY_TONE: Record<ComplianceSeverity, CalloutTone> = {
  info: "info",
  warn: "warn",
  high: "bad",
};

const CATEGORY: Record<ComplianceSuggestion["category"], string> = {
  exclusion: "Exclusion",
  assumption: "Assumption",
  term: "Term",
};

/**
 * The compliance check in the new look (ComplianceAgent look="new"). Same
 * flags, clauses and test ids as the classic panel; each clause still only
 * leaves the page when its Copy button is tapped.
 */
export function ComplianceAgentV2({ report }: { report: ComplianceReport }) {
  return (
    <section data-testid="agent-compliance" className="space-y-4">
      {report.flags.length === 0 ? (
        <p data-testid="agent-compliance-clean" className="flex items-start gap-2">
          <CheckCircle aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-[1.25rem] text-ui-ok" />
          <span>Nothing flagged in the wording, exclusions or terms.</span>
        </p>
      ) : (
        <ul className="space-y-2">
          {report.flags.map((flag) => (
            <li key={flag.id} data-testid={`agent-compliance-flag-${flag.id}`} data-severity={flag.severity}>
              <Callout tone={SEVERITY_TONE[flag.severity]} title={flag.message}>
                {flag.fixHint}
              </Callout>
            </li>
          ))}
        </ul>
      )}

      {report.suggestions.length > 0 ? (
        <div>
          <h3 className="ui-title text-ui-base text-ui-text">Clauses you can copy</h3>
          <p className="text-ui-sm text-ui-muted">Paste the ones that fit into the quote&apos;s notes or terms.</p>
          <ul className="mt-3 space-y-2">
            {report.suggestions.map((clause) => (
              <li
                key={clause.id}
                data-testid={`agent-compliance-suggestion-${clause.id}`}
                className="rounded-ui-md bg-ui-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{clause.title}</p>
                    <p className="text-ui-sm text-ui-muted">{CATEGORY[clause.category]}</p>
                  </div>
                  <CopyButton
                    look="new"
                    text={clause.body}
                    label={
                      <>
                        Copy<span className="sr-only"> {clause.title}</span>
                      </>
                    }
                    testId={`copy-${clause.id}`}
                  />
                </div>
                <p className="mt-2 text-ui-sm">{clause.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-ui-sm text-ui-muted">
        Not legal advice. These are common clauses, so change them to suit the job.
      </p>
    </section>
  );
}
