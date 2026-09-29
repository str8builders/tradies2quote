import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import { formatCurrency } from "@/lib/quote-defaults";
import type { QuoteLineItem } from "@/lib/quote-types";
import { lineProvenance, type LineProvenance } from "../line-sources";
import { groupLines, lineMarker, quantityText, type LineRow } from "../lines";
import type { LineLibraryItem } from "../types";

function Detail({ line, currency }: { line: QuoteLineItem; currency: string }) {
  const price = Number(line.unit_price) || 0;
  return (
    <>
      {quantityText(line)}
      {price > 0 ? ` × ${formatCurrency(price, currency, 4)}` : null}
    </>
  );
}

function Trailing({ line, currency, sizesConfirmed }: { line: QuoteLineItem; currency: string; sizesConfirmed: boolean }) {
  const marker = lineMarker(line, sizesConfirmed);
  if (marker === "check") return <StatusPill tone="warn">Check this</StatusPill>;
  if (marker === "price") return <StatusPill tone="warn">Needs price</StatusPill>;
  return <Money amount={Number(line.line_total) || 0} currency={currency} />;
}

/**
 * Where the line's numbers came from, under its row: the pills in words and
 * the supplier's page. Outside the row's button, so the link is its own tap.
 */
function Provenance({ provenance }: { provenance: LineProvenance }) {
  const { sources, link } = provenance;
  return (
    <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3" data-testid="job-line-source">
      {sources.map((source) => (
        <StatusPill key={source.kind} tone={source.tone}>
          {source.words}
        </StatusPill>
      ))}
      {link ? (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="job-line-supplier"
          className="ui-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-ui-md text-ui-sm font-semibold text-ui-brand-text underline-offset-2 hover:underline"
        >
          <ArrowSquareOut aria-hidden="true" weight="bold" className="shrink-0 text-[1.15em]" />
          {link.words}
        </a>
      ) : null}
    </div>
  );
}

/** One card of line rows. */
function Rows({
  rows,
  currency,
  sizesConfirmed,
  library,
  onOpen,
}: {
  rows: readonly LineRow[];
  currency: string;
  sizesConfirmed: boolean;
  library: ReadonlyMap<string, LineLibraryItem>;
  onOpen?: (index: number) => void;
}) {
  return (
    <Card padding="none">
      <ul className="divide-y divide-ui-line">
        {rows.map(({ line, index }) => {
          const provenance = lineProvenance(line, line.library_id ? library.get(line.library_id) : null);
          const shown = provenance.sources.length > 0 || provenance.link !== null;
          return (
            <li
              key={index}
              data-line-index={index}
              data-source={provenance.sources.map((source) => source.kind).join(" ") || undefined}
            >
              <ListRow
                title={line.description?.trim() || "Untitled line"}
                subtitle={<Detail line={line} currency={currency} />}
                trailing={<Trailing line={line} currency={currency} sizesConfirmed={sizesConfirmed} />}
                onClick={onOpen ? () => onOpen(index) : undefined}
              />
              {shown ? <Provenance provenance={provenance} /> : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/**
 * What's in the job: plain line cards grouped Labour, Materials, Other. Each
 * shows what it is, how many, and the amount, or one plain marker when it
 * needs the tradie; a material line also says where its numbers came from
 * (the classic editor's badges, as pills) with its supplier's page. Tapping
 * opens the edit sheet unless the quote is locked. Lines with trade sections
 * (a quote from a plan set) show under a heading per trade, with its subtotal.
 */
export function LineList({
  lines,
  currency,
  sizesConfirmed = false,
  libraryMatches = [],
  onOpen,
}: {
  lines: readonly QuoteLineItem[];
  currency: string;
  /** Every drawing size confirmed: the calculator's lines count as checked (the send gate's rule). */
  sizesConfirmed?: boolean;
  /** The library items the lines are matched to (supplier, product page, estimated or not). */
  libraryMatches?: readonly LineLibraryItem[];
  /** Omit for a locked, read-only quote. */
  onOpen?: (index: number) => void;
}) {
  const groups = groupLines(lines);
  const library = new Map(libraryMatches.map((item) => [item.id, item]));
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
          {group.sections ? (
            <div className="space-y-4" data-testid={`job-sections-${group.type}`}>
              {group.sections.map((section) => (
                <section key={section.title} aria-label={section.title} data-section={section.title} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <h4 className="text-ui-sm font-semibold text-ui-muted">{section.title}</h4>
                    <Money amount={section.subtotal} currency={currency} className="text-ui-sm text-ui-muted" />
                  </div>
                  <Rows rows={section.rows} currency={currency} sizesConfirmed={sizesConfirmed} library={library} onOpen={onOpen} />
                </section>
              ))}
            </div>
          ) : (
            <Rows rows={group.rows} currency={currency} sizesConfirmed={sizesConfirmed} library={library} onOpen={onOpen} />
          )}
        </section>
      ))}
    </div>
  );
}
