import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency } from "@/lib/quote-defaults";
import type { QuoteLineItem } from "@/lib/quote-types";
import { groupLines, lineMarker, quantityText } from "../lines";

function Detail({ line, currency }: { line: QuoteLineItem; currency: string }) {
  const price = Number(line.unit_price) || 0;
  return (
    <>
      {quantityText(line)}
      {price > 0 ? ` × ${formatCurrency(price, currency, 4)}` : null}
    </>
  );
}

function Trailing({ line, currency }: { line: QuoteLineItem; currency: string }) {
  const marker = lineMarker(line);
  if (marker === "check") return <StatusPill tone="warn">Check this</StatusPill>;
  if (marker === "price") return <StatusPill tone="warn">Needs price</StatusPill>;
  return <Money amount={Number(line.line_total) || 0} currency={currency} />;
}

/**
 * What's in the job: plain line cards grouped Labour, Materials, Other. Each
 * shows what it is, how many, and the amount, or one plain marker when it
 * needs the tradie. Tapping opens the edit sheet unless the quote is locked.
 */
export function LineList({
  lines,
  currency,
  onOpen,
}: {
  lines: readonly QuoteLineItem[];
  currency: string;
  /** Omit for a locked, read-only quote. */
  onOpen?: (index: number) => void;
}) {
  const groups = groupLines(lines);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.type} aria-labelledby={`job-lines-${group.type}`} className="space-y-2">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <h3 id={`job-lines-${group.type}`} className="ui-title text-ui-base text-ui-text">
              {group.title}
            </h3>
            <Money amount={group.subtotal} currency={currency} className="text-ui-sm text-ui-muted" />
          </div>
          <Card padding="none">
            <ul className="divide-y divide-ui-line">
              {group.rows.map(({ line, index }) => (
                <li key={index} data-line-index={index}>
                  <ListRow
                    title={line.description?.trim() || "Untitled line"}
                    subtitle={<Detail line={line} currency={currency} />}
                    trailing={<Trailing line={line} currency={currency} />}
                    onClick={onOpen ? () => onOpen(index) : undefined}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
