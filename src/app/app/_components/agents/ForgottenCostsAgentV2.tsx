import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { Callout } from "@/components/ui/callout";
import { Money } from "@/components/ui/money";
import type { ForgottenCostReport } from "@/lib/agents/forgotten-costs";

/**
 * The forgotten-cost scan in the new look (ForgottenCostsAgent look="new").
 * Same report and test ids as the classic panel, drawn for the job page's
 * "More tools" sheet, whose section title already names it. Advisory only.
 */
export function ForgottenCostsAgentV2({ report, currency }: { report: ForgottenCostReport; currency: string }) {
  const count = report.costs.length;
  return (
    <section data-testid="agent-forgotten-costs" className="space-y-4">
      {report.clean ? (
        <p data-testid="agent-forgotten-costs-clean" className="flex items-start gap-2">
          <CheckCircle aria-hidden="true" weight="fill" className="mt-0.5 shrink-0 text-[1.25rem] text-ui-ok" />
          <span>You&apos;ve covered the costs jobs like this usually miss.</span>
        </p>
      ) : (
        <>
          <div data-testid="agent-forgotten-costs-total">
            <Callout
              tone="warn"
              title={
                <>
                  About <Money amount={report.totalEstimated} currency={currency} /> could be missing
                </>
              }
            >
              {count} {count === 1 ? "cost" : "costs"} a job like this usually has {count === 1 ? "isn't" : "aren't"} on
              the quote yet.
            </Callout>
          </div>
          <ul className="space-y-2">
            {report.costs.map((cost) => (
              <li
                key={cost.id}
                data-testid={`agent-forgotten-cost-${cost.id}`}
                className="rounded-ui-md bg-ui-surface-2 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 font-semibold">{cost.label}</p>
                  <p className="shrink-0 font-semibold">
                    About <Money amount={cost.estimated} currency={currency} />
                  </p>
                </div>
                <p className="mt-1 text-ui-sm">{cost.why}</p>
                <p className="mt-1 text-ui-sm text-ui-muted">{cost.basis}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-ui-sm text-ui-muted">
        These are starting estimates. Add the ones that apply as lines on the quote.
      </p>
    </section>
  );
}
