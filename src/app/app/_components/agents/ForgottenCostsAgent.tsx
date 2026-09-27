import { Coins, TrendUp, CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { detectForgottenCosts } from "@/lib/agents/forgotten-costs";
import { formatCurrency } from "@/lib/quote-defaults";
import type { QuoteData } from "@/lib/quote-types";
import { ForgottenCostsAgentV2 } from "./ForgottenCostsAgentV2";

/**
 * Forgotten-Cost Detector panel — read-only.
 *
 * Runs the pure `detectForgottenCosts` scan over `quote_data` and shows
 * the commonly-missed costs that apply to this job but aren't on the
 * quote, each with a starting estimate, plus the headline "you might be
 * leaving $X on the table" figure.
 *
 * Advisory only — it never edits the quote. The tradie reviews each
 * flagged cost and adds the lines they agree with in the editor above.
 *
 * `look="new"` draws the same report with the kit (ForgottenCostsAgentV2)
 * for the new-look job page.
 */
interface Props {
  quoteData: QuoteData | null;
  look?: "classic" | "new";
}

export function ForgottenCostsAgent({ quoteData, look = "classic" }: Props) {
  const report = detectForgottenCosts(quoteData);
  const currency = quoteData?.currency || "NZD";
  if (look === "new") return <ForgottenCostsAgentV2 report={report} currency={currency} />;

  return (
    <section
      data-testid="agent-forgotten-costs"
      className="t2q-card-pro mb-6 p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand"
        >
          <Coins size={20} weight="bold" />
        </span>
        <div>
          <h2 className="font-display text-lg uppercase tracking-tight text-white sm:text-xl">
            Forgotten-Cost Detector.
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300">
            {"// read-only · scans for costs that quietly eat your margin"}
          </p>
        </div>
      </div>

      {report.clean ? (
        <p
          data-testid="agent-forgotten-costs-clean"
          className="mt-5 inline-flex items-center gap-2 rounded-sm border border-brand/40 bg-brand/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand"
        >
          <CheckCircle size={14} weight="fill" />
          Looks like you&apos;ve covered the usual suspects
        </p>
      ) : (
        <>
          <div
            data-testid="agent-forgotten-costs-total"
            className="mt-5 rounded-sm border border-hivis/40 bg-hivis/10 p-4"
          >
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-hivis">
              <TrendUp size={14} weight="bold" />
              {"// possibly missing"}
            </p>
            <p className="mt-1 font-display text-2xl uppercase tracking-tight text-white">
              &#8776;{formatCurrency(report.totalEstimated, currency)}
            </p>
            <p className="mt-1 text-xs text-ink-300">
              {report.costs.length} cost
              {report.costs.length === 1 ? "" : "s"} a job like this usually
              hits — not on the quote yet.
            </p>
          </div>

          <ul className="mt-4 space-y-2.5">
            {report.costs.map((c) => (
              <li
                key={c.id}
                data-testid={`agent-forgotten-cost-${c.id}`}
                className="rounded-sm border border-ink-700 bg-ink-900/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-sm uppercase tracking-tight text-white">
                    {c.label}
                  </p>
                  <span className="shrink-0 font-display tabular-nums text-sm text-hivis">
                    &#8776;{formatCurrency(c.estimated, currency)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-ink-300">
                  {c.why}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">
                  {`// ${c.basis}`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {"// estimates are starting points — add the lines that apply in the editor above"}
      </p>
    </section>
  );
}
