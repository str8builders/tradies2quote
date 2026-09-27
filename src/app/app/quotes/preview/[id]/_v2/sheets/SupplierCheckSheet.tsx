"use client";

import { useState, type ReactNode } from "react";
import { ArrowCounterClockwise, ArrowsClockwise, CaretDown } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Money } from "@/components/ui/money";
import { StatusPill } from "@/components/ui/status-pill";
import {
  liveLineTotal,
  supplierCheck,
  withLineBack,
  withSupplierPriceAt,
  withSupplierValues,
  type RemovedSupplierLine,
  type SupplierGap,
  type SupplierLineCheck,
  type SupplierMismatches,
  type SupplierSubtotalCheck,
} from "@/lib/materials/supplierReconcile";
import { formatCurrency } from "@/lib/quote-defaults";
import { formatQuantity, formatUnitPrice } from "@/lib/quantity-display";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { quantityText } from "../lines";

/**
 * The job page's callout title for what the send gate will block on, in
 * plain words; null when the quote matches the supplier's (or wasn't made
 * from one).
 */
export function supplierCheckTitle(off: SupplierMismatches): string | null {
  if (off.count === 0) return null;
  const n = off.lines.length;
  if (n > 0) return `${n} ${n === 1 ? "line doesn't" : "lines don't"} match the supplier's quote`;
  return "The lines don't add up to the supplier's subtotal";
}

/** Which fix is saving: all of them, one line's, or a line going back. */
export type SupplierBusy =
  | { kind: "all" }
  | { kind: "line"; index: number }
  | { kind: "back"; from: number }
  | null;

const name = (line: QuoteLineItem) => line.description?.trim() || "Untitled line";

function joinNames(lines: readonly QuoteLineItem[]): string {
  const names = lines.map(name);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
}

function Matches({ ok }: { ok: boolean }) {
  return ok ? <StatusPill tone="ok">Matches</StatusPill> : <StatusPill tone="bad">Doesn&apos;t match</StatusPill>;
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <dt className="text-ui-muted">{label}</dt>
      <dd className="flex items-center gap-2 font-semibold">{children}</dd>
    </div>
  );
}

/** Their printed subtotal and total beside this quote's. */
function Totals({
  data,
  printed,
  subtotal,
  currency,
}: {
  data: QuoteData;
  printed: { subtotal: number | null; total: number | null };
  subtotal: SupplierSubtotalCheck | null;
  currency: string;
}) {
  const tax = data.tax_label || "GST";
  const incl = (Number(data.tax_rate) || 0) > 0 ? ` incl. ${tax}` : "";
  return (
    <Card data-testid="supplier-totals">
      <dl className="divide-y divide-ui-line">
        {printed.subtotal != null ? (
          <Figure label={`Supplier's subtotal before ${tax}`}>
            <Money amount={printed.subtotal} currency={currency} />
          </Figure>
        ) : null}
        {subtotal ? (
          <Figure label="Their lines here, at their prices">
            <Money amount={subtotal.lines} currency={currency} />
            <Matches ok={!subtotal.mismatch} />
          </Figure>
        ) : null}
        {printed.total != null ? (
          <Figure label={`Supplier's total${incl}`}>
            <Money amount={printed.total} currency={currency} />
          </Figure>
        ) : null}
        <Figure label={`This quote's total${incl}`}>
          <Money amount={Number(data.total) || 0} currency={currency} />
        </Figure>
      </dl>
      {printed.subtotal == null ? (
        <p className="mt-2 text-ui-sm text-ui-muted">Their quote had no subtotal to check against.</p>
      ) : null}
    </Card>
  );
}

/** One of their lines whose total no longer matches theirs, and what fixes it. */
function MismatchRow({
  row,
  currency,
  locked,
  button,
  busy,
  onUse,
  onKeepQuantity,
}: {
  row: SupplierLineCheck;
  currency: string;
  locked: boolean;
  /** Its own button (only when more than one line can be fixed). */
  button: boolean;
  busy: SupplierBusy;
  onUse: () => void;
  /** Keep the tradie's quantity and change the price instead (only when their quantity could go back). */
  onKeepQuantity: () => void;
}) {
  const { line, snapPrice, quantityBack } = row;
  const theirs = Number(line.source_quantity);
  const quantityMoved = Number.isFinite(theirs) && theirs > 0 && Math.abs(theirs - (Number(line.quantity) || 0)) > 1e-9;
  const unit = (line.source_unit ?? line.unit ?? "").trim();
  return (
    <li data-testid="supplier-line" data-line-index={row.index} className="space-y-3 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-semibold break-words">{name(line)}</p>
        <Matches ok={false} />
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div>
          <dt className="text-ui-sm text-ui-muted">Supplier</dt>
          <dd className="font-semibold">
            <Money amount={row.supplierTotal ?? 0} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-ui-sm text-ui-muted">This quote</dt>
          <dd className="font-semibold text-ui-bad">
            <Money amount={row.liveTotal} currency={currency} />
          </dd>
        </div>
      </dl>
      {quantityMoved ? (
        <p className="text-ui-sm text-ui-muted">
          Their quote had {formatQuantity(theirs)}
          {unit ? ` ${unit}` : ""}.
        </p>
      ) : null}
      {locked ? null : quantityBack !== null ? (
        <p className="text-ui-sm text-ui-muted">
          The supplier&apos;s value: their {formatQuantity(quantityBack)}
          {unit ? ` ${unit}` : ""} × {formatUnitPrice((row.supplierTotal ?? 0) / quantityBack, currency)} ={" "}
          {formatCurrency(row.supplierTotal ?? 0, currency)}.
        </p>
      ) : snapPrice !== null ? (
        <p className="text-ui-sm text-ui-muted">
          The supplier&apos;s value: {quantityText(line)} × {formatUnitPrice(snapPrice, currency)} ={" "}
          {formatCurrency(row.supplierTotal ?? 0, currency)}.
        </p>
      ) : (
        <p className="text-ui-sm text-ui-muted">
          It has no quantity, so no price can make it match. Change its quantity first.
        </p>
      )}
      {!locked && button && (quantityBack !== null || snapPrice !== null) ? (
        <Button
          variant="secondary"
          fullWidth
          data-testid="supplier-use-line"
          icon={<ArrowsClockwise weight="bold" />}
          loading={busy?.kind === "line" && busy.index === row.index}
          loadingLabel="Saving…"
          disabled={busy !== null}
          onClick={onUse}
        >
          {quantityBack !== null
            ? `Put back their ${formatQuantity(quantityBack)}${unit ? ` ${unit}` : ""}`
            : "Use the supplier's value"}
        </Button>
      ) : null}
      {!locked && quantityBack !== null && snapPrice !== null ? (
        <Button
          variant="ghost"
          fullWidth
          data-testid="supplier-keep-quantity"
          disabled={busy !== null}
          onClick={onKeepQuantity}
        >
          Keep {quantityText(line)}, change the price
        </Button>
      ) : null}
    </li>
  );
}

/** Their lines don't add up to their subtotal: which to put back or delete, as far as we can tell. */
function Gap({
  subtotal,
  gap,
  currency,
  locked,
  busy,
  onPutBack,
}: {
  subtotal: SupplierSubtotalCheck;
  gap: SupplierGap;
  currency: string;
  locked: boolean;
  busy: SupplierBusy;
  onPutBack: (removed: RemovedSupplierLine) => void;
}) {
  const money = (n: number) => formatCurrency(n, currency);
  const short = subtotal.difference < 0;
  const { removed, repeated, unexplained, ownPrice, unread } = gap;
  return (
    <div data-testid="supplier-gap" data-short={short} className="space-y-3">
      <Callout tone="bad" title="Their lines don't add up to their subtotal">
        They come to {money(subtotal.lines)} here, {money(Math.abs(subtotal.difference))} {short ? "less" : "more"} than
        the {money(subtotal.supplier)} subtotal on their quote.
      </Callout>

      {removed.length > 0 ? (
        <section aria-labelledby="supplier-removed" className="space-y-2">
          <h3 id="supplier-removed" className="font-semibold">
            Taken off since you scanned it
          </h3>
          <Card padding="none">
            <ul className="divide-y divide-ui-line">
              {removed.map((r) => (
                <li key={r.from} data-testid="supplier-removed" data-from={r.from} className="space-y-3 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 font-semibold break-words">{name(r.line)}</p>
                    <Money
                      amount={r.line.source_line_total ?? liveLineTotal(r.line)}
                      currency={currency}
                      className="font-semibold"
                    />
                  </div>
                  <p className="text-ui-sm text-ui-muted">{quantityText(r.line)}</p>
                  {!locked ? (
                    <Button
                      variant="secondary"
                      fullWidth
                      data-testid="supplier-put-back"
                      icon={<ArrowCounterClockwise weight="bold" />}
                      loading={busy?.kind === "back" && busy.from === r.from}
                      loadingLabel="Saving…"
                      disabled={busy !== null}
                      onClick={() => onPutBack(r)}
                    >
                      Put it back
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {repeated.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5" data-testid="supplier-repeated">
          {repeated.map((r) => (
            <li key={r.indexes.join("-")}>
              {name(r.line)} is on here {r.indexes.length === 2 ? "twice" : `${r.indexes.length} times`}.{" "}
              {locked ? null : `Delete ${r.extra === 1 ? "the extra one" : `${r.extra} of them`} from the job.`}
            </li>
          ))}
        </ul>
      ) : null}

      {unexplained ? (
        <div data-testid="supplier-unexplained" className="space-y-2">
          <p>{short ? "A line from their quote may be missing." : "A line may be on here twice, or priced differently."}</p>
          {ownPrice.length > 0 ? (
            <p>
              Their quote had no total for {joinNames(ownPrice.map((r) => r.line))}, so{" "}
              {ownPrice.length === 1 ? "it counts" : "they count"} at your price. If you changed{" "}
              {ownPrice.length === 1 ? "it" : "one"}, put the price back.
            </p>
          ) : null}
          {unread.length > 0 ? (
            <p>
              We couldn&apos;t read {unread.length === 1 ? "this row" : "these rows"} on their quote:{" "}
              {unread.map((text) => `“${text}”`).join(", ")}.
            </p>
          ) : null}
          {locked ? null : (
            <p>
              {short ? "A line you add yourself doesn't count as one of theirs, so if" : "If"} you can&apos;t find
              it, scan their quote again.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export interface SupplierCheckSheetViewProps {
  /** The quote as the page shows it now: the sheet follows each fix as it lands. */
  data: QuoteData;
  /** The lines as scanned in (quotes.ai_snapshot line_items): names a line taken off since, to put back. */
  imported?: readonly QuoteLineItem[] | null;
  /** Accepted or later: the comparison only, nothing to change. */
  locked?: boolean;
  busy: SupplierBusy;
  error: string | null;
  onUseAll: () => void;
  onUseLine: (index: number) => void;
  /** Keep a changed quantity and snap its price instead of putting theirs back. */
  onKeepQuantity: (index: number) => void;
  onPutBack: (removed: RemovedSupplierLine) => void;
  onClose: () => void;
}

/**
 * A quote made from a scanned supplier quote, against that quote: their
 * subtotal and total beside this one's, each of their lines with its total
 * then and now, the supplier's exact value for any line that's off, and
 * which lines to put back or delete when the subtotal is out. Every mark
 * follows the send gate, which won't send the quote until it all matches.
 */
export function SupplierCheckSheetView({
  data,
  imported = null,
  locked = false,
  busy,
  error,
  onUseAll,
  onUseLine,
  onKeepQuantity,
  onPutBack,
  onClose,
}: SupplierCheckSheetViewProps) {
  const check = supplierCheck(data, imported);
  const currency = data.currency || "NZD";
  const fixable = !locked && check ? check.fixable.length : 0;
  const from = check?.supplier ? `Made from the ${check.supplier} quote you scanned.` : "Made from a supplier's quote you scanned.";

  let footer: ReactNode;
  if (fixable > 0) {
    footer = (
      <Button
        fullWidth
        data-testid="supplier-use-all"
        icon={<ArrowsClockwise weight="bold" />}
        loading={busy?.kind === "all"}
        loadingLabel="Saving…"
        disabled={busy !== null}
        onClick={onUseAll}
      >
        {fixable > 1 ? "Use the supplier's values for all" : singleFixLabel(check!.fixable[0])}
      </Button>
    );
  } else if (!check || check.fixed || locked) {
    footer = (
      <Button fullWidth data-testid="supplier-done" onClick={onClose}>
        Done
      </Button>
    );
  } else {
    footer = (
      <Button variant="secondary" fullWidth data-testid="supplier-done" onClick={onClose}>
        Close
      </Button>
    );
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Check against the supplier's quote"
      description={check ? (locked ? from : `${from} It can't be sent until the two match.`) : undefined}
      footer={footer}
    >
      <div className="space-y-5" data-testid="supplier-check" data-fixed={check ? check.fixed : true}>
        {!check ? (
          <p className="text-ui-muted">This quote wasn&apos;t made from a supplier&apos;s quote, so there&apos;s nothing to check.</p>
        ) : (
          <>
            {locked ? (
              <Callout tone="info" title="This quote has been accepted, so its lines can't change now." />
            ) : check.fixed && check.rows.length > 0 ? (
              <Callout tone="ok" title="Everything matches the supplier's quote" />
            ) : check.rows.length === 0 ? (
              <Callout tone="info" title="None of the supplier's lines are on this quote now." />
            ) : null}

            <Totals data={data} printed={check.printed} subtotal={check.subtotal} currency={currency} />

            {check.mismatched.length > 0 ? (
              <section aria-labelledby="supplier-off" className="space-y-2">
                <h3 id="supplier-off" className="font-semibold">
                  {check.mismatched.length}{" "}
                  {check.mismatched.length === 1 ? "line doesn't" : "lines don't"} match
                </h3>
                <Card padding="none">
                  <ul className="divide-y divide-ui-line">
                    {check.mismatched.map((row) => (
                      <MismatchRow
                        key={row.index}
                        row={row}
                        currency={currency}
                        locked={locked}
                        button={fixable > 1}
                        busy={busy}
                        onUse={() => onUseLine(row.index)}
                        onKeepQuantity={() => onKeepQuantity(row.index)}
                      />
                    ))}
                  </ul>
                </Card>
              </section>
            ) : null}

            {check.subtotal && check.gap ? (
              <Gap
                subtotal={check.subtotal}
                gap={check.gap}
                currency={currency}
                locked={locked}
                busy={busy}
                onPutBack={onPutBack}
              />
            ) : null}

            {check.rows.length > 0 ? (
              <details className="group" open={check.mismatched.length === 0}>
                <summary className="ui-focus-ring flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-ui-sm font-semibold text-ui-brand-text [&::-webkit-details-marker]:hidden">
                  {check.rows.length === 1 ? "The line from their quote" : `All ${check.rows.length} lines from their quote`}
                  <CaretDown
                    aria-hidden="true"
                    weight="bold"
                    className="shrink-0 transition-transform duration-ui-fast ease-ui-out group-open:rotate-180 motion-reduce:transition-none"
                  />
                </summary>
                <Card padding="none" className="mt-2">
                  <ul className="divide-y divide-ui-line">
                    {check.rows.map((row) => (
                      <li key={row.index} data-line-index={row.index} data-mismatch={row.mismatch}>
                        <ListRow
                          title={name(row.line)}
                          subtitle={
                            <>
                              {row.supplierTotal != null
                                ? `Supplier ${formatCurrency(row.supplierTotal, currency)}`
                                : "No total on their quote"}
                              {` · This quote ${formatCurrency(row.liveTotal, currency)}`}
                            </>
                          }
                          trailing={row.supplierTotal != null ? <Matches ok={!row.mismatch} /> : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </details>
            ) : null}

            {check.others.length > 0 ? (
              <p className="text-ui-sm text-ui-muted">
                Not checked, as {check.others.length === 1 ? "it isn't a line" : "they aren't lines"} on their quote:{" "}
                {joinNames(check.others.map((o) => o.line))}.
              </p>
            ) : null}
          </>
        )}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export interface SupplierCheckSheetProps {
  /** The quote as the page shows it now (it re-renders as each fix lands). */
  data: QuoteData;
  /** Saves the lines through the page's save (saveQuoteChanges); plain words back on failure. */
  onApply: (lines: QuoteLineItem[]) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
  /** Accepted or later: show the comparison, offer no fixes. */
  locked?: boolean;
  /** Optional: the lines as scanned in (quotes.ai_snapshot), so a line taken off since can be named and put back. */
  imported?: readonly QuoteLineItem[] | null;
}

/**
 * Check a quote made from a scanned supplier quote against that quote
 * without leaving the job: the classic editor's supplier reconciliation in
 * the new look, by the send gate's rules. Fixes save the whole line list
 * through `onApply`: the supplier's exact unit price (full precision, which
 * the price boxes can't type) on one line or all of them, or a line put back.
 */
export function SupplierCheckSheet({ data, onApply, onClose, locked = false, imported = null }: SupplierCheckSheetProps) {
  const [busy, setBusy] = useState<SupplierBusy>(null);
  const [error, setError] = useState<string | null>(null);

  async function apply(lines: QuoteLineItem[], what: NonNullable<SupplierBusy>) {
    if (locked || busy) return;
    setBusy(what);
    setError(null);
    const result = await onApply(lines);
    setBusy(null);
    if ("error" in result) setError(result.error);
  }

  return (
    <SupplierCheckSheetView
      data={data}
      imported={imported}
      locked={locked}
      busy={busy}
      error={error}
      onUseAll={() => apply(withSupplierValues(data.line_items), { kind: "all" })}
      onUseLine={(index) => apply(withSupplierValues(data.line_items, [index]), { kind: "line", index })}
      onKeepQuantity={(index) => apply(withSupplierPriceAt(data.line_items, index), { kind: "line", index })}
      onPutBack={(removed) => apply(withLineBack(data.line_items, removed), { kind: "back", from: removed.from })}
      onClose={onClose}
    />
  );
}

/** The one fix's button: their quantity back when that's what moved, else their value. */
function singleFixLabel(row: SupplierLineCheck): string {
  if (row.quantityBack === null) return "Use the supplier's value";
  const unit = (row.line.source_unit ?? row.line.unit ?? "").trim();
  return `Put back their ${formatQuantity(row.quantityBack)}${unit ? ` ${unit}` : ""}`;
}
