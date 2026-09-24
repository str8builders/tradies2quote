import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import type { Tone } from "@/components/ui/styles";
import type { QuoteData } from "@/lib/quote-types";
import { totalsBreakdown } from "../lines";

function Row({ label, amount, currency, strong }: { label: string; amount: number; currency: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className={strong ? "font-semibold text-ui-text" : "text-ui-muted"}>{label}</dt>
      <dd className={strong ? "font-semibold" : undefined}>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}

/**
 * The job's total, big and in tabular figures, with its tax label. The
 * breakdown is one tap away. `unpriced` warns that the total isn't final.
 */
export function TotalCard({
  data,
  stateLabel,
  stateTone = "neutral",
  unpriced,
}: {
  /** The quote as it will be saved (totals recomputed). */
  data: QuoteData;
  stateLabel: string;
  stateTone?: Tone;
  unpriced: number;
}) {
  const currency = data.currency || "NZD";
  const b = totalsBreakdown(data);
  const taxed = b.taxRate > 0;
  return (
    <Card data-testid="job-total">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-ui-sm text-ui-muted">{taxed ? `Total incl. ${b.taxLabel}` : "Total"}</p>
          <Money amount={b.total} currency={currency} className="block text-ui-display font-bold" />
        </div>
        <StatusPill tone={stateTone}>{stateLabel}</StatusPill>
      </div>
      {unpriced > 0 ? (
        <p className="mt-2 text-ui-sm font-semibold text-ui-warn">
          Not final yet: {unpriced} {unpriced === 1 ? "line has" : "lines have"} no price.
        </p>
      ) : null}
      <details className="group mt-3 border-t border-ui-line pt-2">
        <summary className="ui-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-ui-sm font-semibold text-ui-brand-text [&::-webkit-details-marker]:hidden">
          How it adds up
          <CaretDown
            aria-hidden="true"
            weight="bold"
            className="shrink-0 transition-transform duration-ui-fast ease-ui-out group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <dl className="pb-1 text-ui-base">
          {b.materials !== 0 ? <Row label="Materials" amount={b.materials} currency={currency} /> : null}
          {b.other !== 0 ? <Row label="Other costs" amount={b.other} currency={currency} /> : null}
          {b.markup !== 0 ? <Row label={`Markup (${b.markupPct}%)`} amount={b.markup} currency={currency} /> : null}
          {b.labour !== 0 ? <Row label="Labour" amount={b.labour} currency={currency} /> : null}
          <Row label={taxed ? `Before ${b.taxLabel}` : "Subtotal"} amount={b.beforeTax} currency={currency} />
          {taxed ? <Row label={`${b.taxLabel} (${b.taxRate}%)`} amount={b.tax} currency={currency} /> : null}
          <Row label="Total" amount={b.total} currency={currency} strong />
        </dl>
      </details>
    </Card>
  );
}
