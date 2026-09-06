"use client";

import { ArrowSquareOut, FileText } from "@phosphor-icons/react/dist/ssr";
import {
  formatCurrency,
  formatIssueDate,
  splitDisplaySubtotals,
} from "@/lib/quote-defaults";
import type { PublicQuotePayload, PublicLineItem } from "@/lib/quote-types";
import { formatQuantity, formatUnitPrice } from "@/lib/quantity-display";

type Props = {
  token: string;
  quote: PublicQuotePayload;
};

export function PublicQuoteSummary({ token, quote }: Props) {
  const materials = quote.line_items.filter((it) => it.type === "material");
  const labour = quote.line_items.filter((it) => it.type === "labour");
  const other = quote.line_items.filter((it) => it.type === "other");

  // `materials_subtotal` bundles material + other (markup applies to the
  // bundle). splitDisplaySubtotals (shared with the editor + PDF) splits it
  // for display so each subtotal ties out to its visible section.
  const { materials: materialsOnlySubtotal, other: otherSubtotal } =
    splitDisplaySubtotals(quote.line_items);

  return (
    <section data-testid="public-quote-summary" className="space-y-6">
      <header className="t2q-card-pro p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
              {"// quote from"}
            </p>
            <h1 className="mt-1 font-display text-2xl uppercase tracking-tight sm:text-3xl">
              {quote.business_name ?? "Your tradie"}
            </h1>
            <div className="mt-2 space-y-0.5 text-xs text-ink-300">
              {quote.business_email && <div>{quote.business_email}</div>}
              {quote.business_phone && <div>{quote.business_phone}</div>}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              Issued
            </p>
            <p className="font-display text-sm uppercase tracking-tight text-white">
              {quote.created_at ? formatIssueDate(quote.created_at) : "—"}
            </p>
            {quote.expires_at && (
              <>
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
                  Valid until
                </p>
                <p className="font-display text-sm uppercase tracking-tight text-white">
                  {formatIssueDate(quote.expires_at)}
                </p>
              </>
            )}
          </div>
        </div>

        {(quote.client.name || quote.client.address) && (
          <div className="mt-4 border-t border-ink-700 pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              For
            </p>
            <p className="mt-1 font-display text-base uppercase tracking-tight text-white">
              {quote.client.name ?? ""}
            </p>
            {quote.client.address && (
              <p className="mt-0.5 text-sm text-ink-300">{quote.client.address}</p>
            )}
          </div>
        )}

        {quote.job_summary && (
          <p className="mt-4 border-t border-ink-700 pt-4 text-sm text-ink-200">
            {quote.job_summary}
          </p>
        )}
      </header>

      {quote.has_pdf && (
        <a
          href={`/api/quote/${token}/pdf`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="public-pdf-link"
          className="inline-flex items-center gap-2 rounded-sm border border-ink-700 bg-ink-800 px-3 py-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-200 hover:border-brand hover:text-brand"
        >
          <FileText size={14} weight="bold" />
          View full PDF
          <ArrowSquareOut size={12} weight="bold" />
        </a>
      )}

      <Section title="Materials" items={materials} currency={quote.currency} />
      <Section title="Labour" items={labour} currency={quote.currency} />
      {other.length > 0 && (
        <Section title="Other" items={other} currency={quote.currency} />
      )}

      <section className="t2q-card-pro p-5 sm:p-6">
        <Row label="Materials subtotal" value={formatCurrency(materialsOnlySubtotal, quote.currency)} />
        {other.length > 0 && (
          <Row label="Other subtotal" value={formatCurrency(otherSubtotal, quote.currency)} />
        )}
        <Row label={`Markup`} value={formatCurrency(quote.markup_amount, quote.currency)} />
        <Row label="Labour subtotal" value={formatCurrency(quote.labour_subtotal, quote.currency)} />
        <Row label={quote.tax_rate > 0 ? `Subtotal (excl. ${quote.tax_label})` : "Subtotal"} value={formatCurrency(quote.subtotal_before_tax, quote.currency)} divider />
        <Row label={`${quote.tax_label} (${quote.tax_rate}%)`} value={formatCurrency(quote.tax_amount, quote.currency)} />
        <Row label={quote.tax_rate > 0 ? `Total (incl. ${quote.tax_label})` : "Total"} value={formatCurrency(quote.total, quote.currency)} emphasis />
      </section>

      {quote.terms && (
        <section className="t2q-card-pro p-5 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            Terms
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-200">
            {quote.terms}
          </p>
        </section>
      )}
    </section>
  );
}

function Section({
  title,
  items,
  currency,
}: {
  title: string;
  items: PublicLineItem[];
  currency: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="t2q-card-pro p-5 sm:p-6">
      <h3 className="font-display text-base uppercase tracking-tight text-brand">
        {title}
      </h3>
      <ul className="mt-3 divide-y divide-ink-700">
        {items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">{it.description}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                {formatQuantity(it.quantity, it.unit_price)} {it.unit} · {formatUnitPrice(it.unit_price, currency)}
              </p>
            </div>
            <p className="shrink-0 font-mono text-sm tabular-nums text-white">
              {formatCurrency(it.line_total, currency)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({
  label,
  value,
  divider,
  emphasis,
}: {
  label: string;
  value: string;
  divider?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-3",
        emphasis
          ? "mt-3 rounded-xl border border-brand/40 bg-brand/10 px-3.5 py-3"
          : divider
            ? "mt-2 border-t border-ink-700 pt-3 py-1.5"
            : "py-1.5",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        className={
          emphasis
            ? "min-w-0 truncate font-mono text-sm font-semibold uppercase tracking-[0.2em] text-white"
            : "font-mono text-xs uppercase tracking-[0.2em] text-ink-300"
        }
      >
        {label}
      </span>
      <span
        className={
          emphasis
            ? "shrink-0 whitespace-nowrap font-semibold tabular-nums text-brand"
            : "tabular-nums text-white"
        }
      >
        {value}
      </span>
    </div>
  );
}
