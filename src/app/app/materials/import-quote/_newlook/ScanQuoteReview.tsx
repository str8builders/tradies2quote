"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CaretDown,
  Check,
  Image as ImageIcon,
  MagnifyingGlass,
  Receipt,
  Trash,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import { BottomActionBar } from "@/components/ui/bottom-action-bar";
import { Button } from "@/components/ui/button";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconButton } from "@/components/ui/icon-button";
import { currencySymbol } from "@/components/ui/lib/number-input";
import { Money } from "@/components/ui/money";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import type { Tone } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import type { ValidationCheck } from "@/lib/materials/quoteValidation";
import type { ScanReviewRow } from "@/lib/materials/scanReview";
import { formatCurrency } from "@/lib/quote-defaults";
import { validRowPrice } from "../_components/QuoteImportClient";
import { ScanGstNote } from "../_components/ScanGstNote";
import { CheckRow, ScanError, type ScanState } from "./parts";

const ORDER = [
  { value: "source", label: "Original order" },
  { value: "label", label: "Name A–Z" },
  { value: "amount", label: "Price low–high" },
  { value: "amount-desc", label: "Price high–low" },
] as const;

/**
 * Step two in the new look: every line checked before anything is saved.
 * The supplier's printed totals are checked against the lines as they
 * change, and a mismatch holds both ways out until it's fixed or the tradie
 * ticks that they've checked it. The two ways out stay at the thumb while
 * the lines scroll.
 */
export function ScanQuoteReview({ q, currency, taxLabel }: { q: ScanState; currency: string; taxLabel: string }) {
  const busy = q.phase !== "review";
  const lines = q.rows.length;
  const printedTotals = [q.srcSubtotal, q.srcGst, q.srcTotal, q.srcFreight, q.srcDiscount, q.srcAdjustments].some(
    (value) => value != null,
  );

  return (
    <div className="space-y-6" data-testid="scan-quote-review">
      <Card as="section" padding="lg" className="space-y-4" aria-labelledby="scan-quote-check">
        <SectionTitle
          id="scan-quote-check"
          description={
            lines === 0
              ? `No lines found in ${q.fileName}.`
              : `${lines} ${lines === 1 ? "line" : "lines"} read from ${q.fileName}.`
          }
          action={
            q.scanViews.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<ImageIcon weight="bold" />}
                onClick={() => q.setZoomOpen(true)}
                data-testid="quote-import-view-scan"
              >
                View scan
              </Button>
            ) : null
          }
        >
          Check the lines
        </SectionTitle>
        <TextField
          label="Supplier"
          placeholder="e.g. ITM"
          autoComplete="off"
          value={q.supplier}
          onChange={(event) => q.setSupplier(event.target.value)}
        />
        <div className="space-y-2">
          <CheckRow
            checked={q.gstInclusive}
            onChange={(checked) => {
              q.setGstInclusive(checked);
              q.setAcknowledged(false);
            }}
            label={`Prices include ${taxLabel}`}
            testId="quote-import-gst"
          />
          <ScanGstNote look="new" detected={q.gstDetected} inclusive={q.gstInclusive} taxLabel={taxLabel} />
        </div>
      </Card>

      <ScanNotices q={q} />
      <ReviewControls q={q} busy={busy} />

      <fieldset disabled={busy} className="min-w-0">
        <ul className="space-y-3" aria-label="Lines on the quote" data-testid="quote-import-rows">
          {q.review.rows.map(({ value: row }) => (
            <LineCard key={row.id} q={q} row={row} currency={currency} />
          ))}
        </ul>
      </fieldset>

      {printedTotals ? <TotalsCheck q={q} currency={currency} taxLabel={taxLabel} /> : null}

      {q.libraryMerges.length > 0 ? (
        <div data-testid="quote-import-library-merges">
          <Callout tone="info" title="On more than one line">
            {q.libraryMerges.map((m) => `“${m.name}” (${m.count} lines)`).join(", ")}. Added to your prices, each is
            saved once, with the clearest read. Rename a line if they&rsquo;re different products.
          </Callout>
        </div>
      ) : null}

      {q.validation.blocking ? (
        <div data-testid="quote-import-block">
          <Callout tone="bad" title="Some numbers don’t add up">
            <p>
              They&rsquo;re flagged above. Fix them, or tap &ldquo;Use supplier value&rdquo;, then make the quote or
              add the prices.
            </p>
            <CheckRow
              className="mt-2"
              checked={q.acknowledged}
              onChange={q.setAcknowledged}
              label="I’ve checked these — go ahead anyway"
              testId="quote-import-acknowledge"
            />
          </Callout>
        </div>
      ) : null}

      <WaysOut q={q} />
    </div>
  );
}

/** What the reader wants the tradie to know before the lines: pages it missed, doubts, notes. */
function ScanNotices({ q }: { q: ScanState }) {
  const lowConfidence = q.rows.filter((r) => r.lowConfidence).length;
  const verdict =
    q.extraction &&
    (q.extraction.status !== "ok" || q.extraction.rowFailures.length > 0 || q.extraction.warnings.length > 0)
      ? q.extraction
      : null;
  const verdictTone: CalloutTone = verdict?.status === "blocked" ? "bad" : verdict?.status === "needs_review" ? "warn" : "info";

  return (
    <>
      {q.failedPages.length > 0 ? (
        <div data-testid="quote-import-failed-pages">
          <Callout
            tone="warn"
            title={
              q.failedPages.length === 1 ? "One page couldn’t be read" : `${q.failedPages.length} pages couldn’t be read`
            }
          >
            <p>The lines below are from the pages that worked.</p>
            <ul className="mt-3 space-y-3">
              {q.failedPages.map((f) => (
                <li key={f.source} className="space-y-2">
                  <p>
                    Number {f.source + 1} ({f.name}): {f.error}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ArrowsClockwise weight="bold" />}
                    loading={q.retrying === f.source}
                    loadingLabel="Reading…"
                    disabled={q.retrying !== null || q.phase !== "review"}
                    onClick={() => void q.retryPage(f.source)}
                    data-testid={`quote-import-retry-${f.source}`}
                  >
                    {`Try number ${f.source + 1} again`}
                  </Button>
                </li>
              ))}
            </ul>
          </Callout>
        </div>
      ) : null}

      {verdict ? (
        <div data-testid="quote-import-extraction" data-status={verdict.status}>
          <Callout
            tone={verdictTone}
            title={
              verdict.status === "blocked"
                ? "The scan missed part of the quote"
                : verdict.status === "needs_review"
                  ? "Some of the scan needs a look"
                  : "About this scan"
            }
          >
            {verdict.status === "blocked" ? <p>Scanning it again is best.</p> : null}
            {verdict.reasons.map((reason, i) => (
              <p key={`r${i}`}>{reason}</p>
            ))}
            {verdict.rowFailures.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {verdict.rowFailures.map((f, i) => (
                  <li key={`f${i}`}>
                    Line {f.index + 1}: {f.reason}
                    {f.raw_text ? ` (“${f.raw_text}”)` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
            {verdict.warnings.map((warning, i) => (
              <p key={`w${i}`} className="mt-1">
                {warning}
              </p>
            ))}
          </Callout>
        </div>
      ) : null}

      {lowConfidence > 0 ? (
        <div data-testid="quote-import-lowconf-tally">
          <Callout
            tone="warn"
            title={`${lowConfidence} ${lowConfidence === 1 ? "line" : "lines"} to double-check`}
          >
            The ones marked &ldquo;Check this line&rdquo; show what the scan read
            {q.scanViews.length > 0 ? <>. Tap &ldquo;View scan&rdquo; to compare them with the photo.</> : "."}
          </Callout>
        </div>
      ) : null}

      {q.notes.length > 0 ? (
        <Callout tone="warn" title="Worth a double-check">
          <ul className="space-y-1">
            {q.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </>
  );
}

/** Find, sort and filter the lines (the view only), and change the shown ones in one go. */
function ReviewControls({ q, busy }: { q: ScanState; busy: boolean }) {
  const view = q.review;
  const shown = view.rows.map((r) => r.id);
  return (
    <Card as="section" padding="md" className="space-y-3" aria-label="Review controls">
      <TextField
        label="Search lines"
        labelHidden
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder="Search by name or code"
        prefix={<MagnifyingGlass aria-hidden="true" weight="bold" />}
        value={view.query}
        onChange={(event) => view.setQuery(event.target.value)}
      />
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 sm:items-end">
        <SelectField label="View order" value={view.sort} options={ORDER} onChange={view.setSort} />
        <CheckRow
          checked={view.attention}
          onChange={view.setAttention}
          label="Needs checking"
          description="Show only the lines to check."
        />
      </div>
      <p role="status" className="text-ui-sm text-ui-muted">
        Showing {view.rows.length} of {view.total} lines. Filtering does not change which lines are included.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || shown.length === 0}
          onClick={() => q.setBulk({ ids: shown, include: true })}
        >
          Include displayed lines
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || shown.length === 0}
          onClick={() => q.setBulk({ ids: shown, include: false })}
        >
          Exclude displayed lines
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<ArrowCounterClockwise weight="bold" />}
          disabled={busy || q.history.length === 0}
          onClick={q.undoRows}
        >
          Undo last edit
        </Button>
      </div>
      {q.bulk ? (
        <div
          role="group"
          aria-label="Confirm bulk change"
          className="space-y-3 rounded-ui-md border-2 border-ui-line-strong bg-ui-surface-2 p-3"
        >
          <p>
            {q.bulk.include ? "Include" : "Exclude"} {q.bulk.ids.length} displayed lines? Hidden lines stay as they are.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={q.applyBulk}>
              Confirm change
            </Button>
            <Button variant="ghost" onClick={() => q.setBulk(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

/** One scanned line: tick it in or out, fix what was read, and see it against the printed line total. */
function LineCard({ q, row: r, currency }: { q: ScanState; row: ScanReviewRow; currency: string }) {
  const badPrice = r.include && !validRowPrice(r);
  const check = r.include ? q.lineCheckById.get(r.id)?.checks[0] : undefined;
  const found = check?.found ?? null;
  const mismatch = check?.severity === "error";
  const priceErrorId = `line-${r.id}-price`;

  return (
    <li
      className={cx(
        "space-y-3 rounded-ui-lg border p-3",
        r.include ? "border-ui-line bg-ui-surface shadow-ui-card" : "border-dashed border-ui-line-strong bg-ui-bg",
      )}
    >
      <div className="flex items-center gap-1">
        <label className="-ml-1 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={r.include}
            onChange={(event) => q.patchRow(r.id, { include: event.target.checked })}
            aria-label="Include this line"
            className="ui-focus-ring h-6 w-6 cursor-pointer accent-ui-brand disabled:cursor-not-allowed"
          />
        </label>
        <LineField
          label="Material name"
          autoComplete="off"
          value={r.name}
          onChange={(event) => q.patchRow(r.id, { name: event.target.value })}
          className="flex-1"
        />
        <IconButton label="Remove line" icon={<Trash weight="bold" />} onClick={() => q.removeRow(r.id)} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
        <LineField
          label="Quantity"
          caption="Quantity"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={r.quantity}
          onChange={(event) => q.patchRow(r.id, { quantity: event.target.value })}
        />
        <LineField
          label="Unit"
          caption="Unit"
          autoComplete="off"
          value={r.unit}
          onChange={(event) => q.patchRow(r.id, { unit: event.target.value })}
        />
        {/* A discount line needs the minus key, so it keeps the full number keyboard. */}
        <LineField
          label="Unit price"
          caption="Unit price"
          type="number"
          inputMode={r.credit ? undefined : "decimal"}
          step="any"
          min={r.credit ? undefined : "0"}
          prefix={currencySymbol(currency)}
          invalid={badPrice}
          aria-describedby={badPrice ? priceErrorId : undefined}
          value={r.price}
          onChange={(event) => q.patchRow(r.id, { price: event.target.value })}
        />
      </div>

      {!r.include || r.lowConfidence || r.sku ? (
        <div className="flex flex-wrap items-center gap-2">
          {!r.include ? <StatusPill>Left out</StatusPill> : null}
          {r.lowConfidence ? (
            <StatusPill tone="warn" icon={<Warning weight="fill" />}>
              Check this line
            </StatusPill>
          ) : null}
          {r.sku ? <span className="text-ui-sm text-ui-muted">Code {r.sku}</span> : null}
        </div>
      ) : null}

      {badPrice ? (
        <p id={priceErrorId} className="flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
          <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
          <span>
            {r.credit ? "Add the discount amount, or untick this line." : "Add a price above zero, or untick this line."}
          </span>
        </p>
      ) : null}
      {r.credit ? (
        <p className="text-ui-sm text-ui-muted" data-testid="quote-import-credit">
          Discount line — it goes on the quote, not into your price library.
        </p>
      ) : null}
      {r.rawText ? (
        <p
          data-testid="quote-import-rawtext"
          className={cx("text-ui-sm break-words", r.lowConfidence ? "text-ui-text" : "text-ui-muted")}
        >
          Scanned as: {r.rawText}
        </p>
      ) : null}

      {check && found != null ? (
        <div
          data-testid="quote-import-line-reconcile"
          className={cx("space-y-2 rounded-ui-md px-3 py-2 text-ui-sm", mismatch ? "bg-ui-bad-soft" : "bg-ui-surface-2")}
        >
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Supplier <Money amount={found} currency={currency} className="font-semibold" />
            </span>
            <span>
              Qty × price{" "}
              {check.expected != null ? (
                <Money amount={check.expected} currency={currency} className="font-semibold" />
              ) : (
                "—"
              )}
            </span>
          </p>
          {mismatch ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill tone="bad" icon={<Warning weight="fill" />}>
                Doesn&rsquo;t match
              </StatusPill>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowsClockwise weight="bold" />}
                onClick={() => q.applySupplierValue(r.id)}
                data-testid="quote-import-use-supplier"
              >
                Use supplier value
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** A compact field for a line (the kit's TextField is a page-sized 56 px box). */
function LineField({
  label,
  caption,
  prefix,
  invalid = false,
  className,
  ...input
}: {
  /** The field's name for screen readers (the old look's names). */
  label: string;
  /** Shown above the box. */
  caption?: string;
  prefix?: ReactNode;
  invalid?: boolean;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "prefix" | "aria-label" | "aria-invalid">) {
  return (
    <label className={cx("block min-w-0", className)}>
      {caption ? <span className="mb-1 block text-ui-xs font-semibold text-ui-muted">{caption}</span> : null}
      <span
        className={cx(
          "ui-focus-within-ring flex min-h-12 items-center gap-1.5 rounded-ui-md border-2 bg-ui-surface px-3 text-ui-base text-ui-text",
          "has-[:disabled]:bg-ui-surface-2 has-[:disabled]:text-ui-faint",
          invalid ? "border-ui-bad" : "border-ui-line-strong",
        )}
      >
        {prefix ? (
          <span aria-hidden="true" className="shrink-0 font-semibold text-ui-muted">
            {prefix}
          </span>
        ) : null}
        <input
          {...input}
          aria-label={label}
          aria-invalid={invalid || undefined}
          className="ui-input-reset min-w-0 flex-1 self-stretch py-2 tabular-nums"
        />
      </span>
    </label>
  );
}

/** A pick-one list in the kit's field style (the kit has none yet). */
function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = `select${useId().replace(/:/g, "")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block font-semibold text-ui-text">
        {label}
      </label>
      <div className="ui-focus-within-ring relative flex min-h-12 items-center rounded-ui-md border-2 border-ui-line-strong bg-ui-surface text-ui-text">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="ui-input-reset min-h-12 w-full min-w-0 cursor-pointer py-2 pr-11 pl-3"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="pointer-events-none absolute right-3 text-[1.25rem] text-ui-muted"
        />
      </div>
    </div>
  );
}

/** How a printed total compares, in words as well as colour. */
function totalStatus(check: ValidationCheck): { tone: Tone; label: string } {
  if (check.severity === "error") return { tone: "bad", label: "Doesn’t match" };
  if (check.found == null) return { tone: "neutral", label: "Not on the quote" };
  if (check.severity === "warning") return { tone: "warn", label: "Check" };
  return { tone: "ok", label: "Matches" };
}

/** The supplier's printed subtotal, tax and total against what the ticked lines add up to. */
function TotalsCheck({ q, currency, taxLabel }: { q: ScanState; currency: string; taxLabel: string }) {
  const name = (field: ValidationCheck["field"]) =>
    field === "gst" ? taxLabel : field === "subtotal" ? "Subtotal" : field === "total" ? "Total" : "Line total";
  const adjustments = [
    q.srcDiscount != null ? `account discount −${formatCurrency(q.srcDiscount, currency)}` : null,
    q.srcFreight != null ? `freight ${formatCurrency(q.srcFreight, currency)}` : null,
    q.srcAdjustments != null ? `other adjustment ${formatCurrency(q.srcAdjustments, currency)}` : null,
  ].filter(Boolean);

  return (
    <Card
      as="section"
      padding="none"
      className="overflow-hidden"
      aria-labelledby="scan-quote-totals"
      data-testid="quote-import-reconcile"
    >
      <SectionTitle
        id="scan-quote-totals"
        className="p-4"
        description="The supplier’s printed totals, against what your lines add up to."
      >
        Totals check
      </SectionTitle>
      <ul className="divide-y divide-ui-line border-t border-ui-line">
        {q.validation.summary.map((c) => {
          const status = totalStatus(c);
          return (
            <li key={c.field} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{name(c.field)}</p>
                <p className="text-ui-sm text-ui-muted">
                  Supplier{" "}
                  {c.found != null ? <Money amount={c.found} currency={currency} className="text-ui-text" /> : "—"}
                  {" · "}Your lines{" "}
                  {c.expected != null ? (
                    <Money amount={c.expected} currency={currency} className="text-ui-text" />
                  ) : (
                    "—"
                  )}
                </p>
              </div>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </li>
          );
        })}
      </ul>
      {adjustments.length > 0 ? (
        <p className="border-t border-ui-line px-4 py-3 text-ui-sm text-ui-muted" data-testid="quote-import-adjustments">
          In the supplier&rsquo;s totals: {adjustments.join(", ")}. They&rsquo;re counted in the total check and go on
          the quote as their own lines.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * The two ways out. Adding the prices waits at the end of the lines; the
 * quote, the main one, rides at the thumb while they scroll: on a phone just
 * above the bottom tab bar (the mobile shell gives bars 5.3rem + the
 * home-indicator inset, see AppNav), from `sm` up on the bottom edge. One
 * button keeps the bar short enough to leave room for the lines, and a
 * problem with either way out shows in it, where it's seen.
 */
function WaysOut({ q }: { q: ScanState }) {
  const saving = q.phase === "saving";
  const creating = q.phase === "creating";
  const lines = q.createable.length;
  const prices = q.includable.length;
  return (
    <>
      <Button
        variant="secondary"
        fullWidth
        icon={<Check weight="bold" />}
        loading={saving}
        loadingLabel="Saving…"
        disabled={creating || prices === 0 || q.blocked}
        onClick={() => void q.save()}
        data-testid="quote-import-save"
      >
        {prices === 0 ? "Nothing to add yet" : `Add ${prices} to your prices`}
      </Button>
      <div
        data-testid="scan-quote-actions"
        className="sticky bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))] z-10 -mx-4 sm:bottom-0 sm:bg-ui-bg sm:pb-[env(safe-area-inset-bottom)]"
      >
        <BottomActionBar
          safeArea={false}
          hint={q.blocked ? "Fix the flagged numbers, or tick “I’ve checked these”, first." : undefined}
        >
          {q.error ? <ScanError error={q.error} /> : null}
          <Button
            fullWidth
            icon={<Receipt weight="bold" />}
            loading={creating}
            loadingLabel="Building quote…"
            disabled={saving || lines === 0 || q.blocked}
            onClick={() => void q.createQuote()}
            data-testid="quote-import-create"
          >
            {lines === 0 ? "Nothing to quote yet" : `Create a quote from ${lines} ${lines === 1 ? "line" : "lines"}`}
          </Button>
        </BottomActionBar>
      </div>
    </>
  );
}
