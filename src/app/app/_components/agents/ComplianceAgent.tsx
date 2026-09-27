import {
  CheckCircle,
  ShieldCheck,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react/dist/ssr";
import {
  runComplianceAgent,
  type ComplianceSeverity,
} from "@/lib/agents/compliance";
import type { QuoteData } from "@/lib/quote-types";
import { ComplianceAgentV2 } from "./ComplianceAgentV2";
import { CopyButton } from "./CopyButton";

/**
 * Compliance Agent panel — read-only.
 *
 * Reads `quote_data` only. Renders a flag list (risky wording, missing
 * exclusions, etc.) and a deck of suggested clauses the tradie can
 * copy. The user must click Copy on each suggestion before the text
 * leaves the page. Nothing is written to the quote automatically.
 *
 * Wave 12 — NZ builder-focused, not legal advice (disclaimer below
 * the cards).
 *
 * `look="new"` draws the same report with the kit (ComplianceAgentV2) for
 * the new-look job page.
 */
interface Props {
  quoteData: QuoteData | null;
  look?: "classic" | "new";
}

const SEVERITY_GLYPH: Record<ComplianceSeverity, React.ReactNode> = {
  info: <CheckCircle size={14} weight="fill" />,
  warn: <Warning size={14} weight="fill" />,
  high: <WarningOctagon size={14} weight="fill" />,
};

const SEVERITY_STYLES: Record<ComplianceSeverity, string> = {
  info: "border-ink-600 bg-ink-800/40 text-ink-200",
  warn: "border-hivis/40 bg-hivis/10 text-hivis",
  high: "border-red-500/40 bg-red-500/10 text-red-300",
};

export function ComplianceAgent({ quoteData, look = "classic" }: Props) {
  const report = runComplianceAgent(quoteData);
  if (look === "new") return <ComplianceAgentV2 report={report} />;

  return (
    <section
      data-testid="agent-compliance"
      className="t2q-card-pro mb-6 p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <ShieldCheck size={20} weight="bold" />
        </span>
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Compliance Agent.
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {"// read-only · approval required to apply"}
          </p>
        </div>
      </div>

      {/* Flags */}
      {report.flags.length === 0 ? (
        <p
          data-testid="agent-compliance-clean"
          className="mt-5 inline-flex items-center gap-2 rounded-sm border border-brand/40 bg-brand/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand"
        >
          <CheckCircle size={14} weight="fill" />
          No compliance flags
        </p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {report.flags.map((f) => (
            <li
              key={f.id}
              data-testid={`agent-compliance-flag-${f.id}`}
              data-severity={f.severity}
              className={`flex items-start gap-2 rounded-sm border px-3 py-2.5 ${SEVERITY_STYLES[f.severity]}`}
            >
              <span aria-hidden="true" className="mt-0.5 shrink-0">
                {SEVERITY_GLYPH[f.severity]}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-snug">{f.message}</p>
                <p className="mt-0.5 text-xs leading-snug opacity-80">
                  {f.fixHint}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Suggestions */}
      {report.suggestions.length > 0 ? (
        <div className="mt-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {"// suggested clauses"}
          </p>
          <ul className="mt-3 space-y-2.5">
            {report.suggestions.map((s) => (
              <li
                key={s.id}
                data-testid={`agent-compliance-suggestion-${s.id}`}
                className="rounded-sm border border-ink-700 bg-ink-900/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-sm uppercase tracking-tight text-white">
                      {s.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.25em] text-ink-400">
                      {`// ${s.category}`}
                    </p>
                  </div>
                  <CopyButton
                    text={s.body}
                    label="Copy"
                    testId={`copy-${s.id}`}
                  />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-200">
                  {s.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {"// not legal advice — these are common clauses, adjust to your job"}
      </p>
    </section>
  );
}
