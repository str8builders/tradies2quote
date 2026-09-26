"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Camera,
  CaretDown,
  Columns,
  FileArrowUp,
  StopCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { UI_TEXT } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { csvGstStatement } from "@/lib/materials";
import { PRICE_LIST_ACCEPT, type ColumnChoice, type ColumnKey, type PriceListRow } from "@/lib/materials/priceList";
import { formatCurrency } from "@/lib/quote-defaults";
import { usePriceListImport, type PriceListImport as ImportState } from "../import/_lib/usePriceListImport";

/** Rows shown in the preview; the rest are counted. */
const PREVIEW_ROWS = 50;

const COLUMN_LABELS: Array<{ key: ColumnKey; label: string; required: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "price", label: "Price", required: true },
  { key: "unit", label: "Unit", required: false },
  { key: "code", label: "Code", required: false },
];

/**
 * "Import a price list" in the new look: a CSV, an Excel sheet, a PDF or
 * photos of a printed list, all ending in the same check before anything
 * is saved, then a plain summary of what was added, updated and skipped.
 */
export function PriceListImport({
  taxRate,
  taxLabel,
  currency,
  needsAiConsent,
}: {
  /** Fraction, e.g. 0.15. */
  taxRate: number;
  taxLabel: string;
  currency: string;
  needsAiConsent: boolean;
}) {
  const state = usePriceListImport({ needsAiConsent });
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const reading = state.phase === "reading";

  const onPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void state.readFiles(files);
  };

  return (
    <div className="space-y-6" data-testid="price-import">
      <input
        ref={fileRef}
        type="file"
        accept={PRICE_LIST_ACCEPT}
        multiple
        className="sr-only"
        onChange={onPicked}
        data-testid="price-import-file"
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        multiple
        className="sr-only"
        onChange={onPicked}
        data-testid="price-import-camera"
      />

      {state.phase === "pick" || reading ? (
        <Card as="section" padding="lg" className="space-y-4" aria-labelledby="price-import-pick">
          <SectionTitle
            id="price-import-pick"
            description="A CSV or Excel file from your supplier's trade account, a PDF, or photos of a printed list."
          >
            Choose your price list
          </SectionTitle>
          <Button
            fullWidth
            icon={<FileArrowUp weight="bold" />}
            loading={reading}
            loadingLabel="Reading your list…"
            onClick={() => fileRef.current?.click()}
            data-testid="price-import-choose"
          >
            Choose a file
          </Button>
          <Button
            variant="secondary"
            fullWidth
            icon={<Camera weight="bold" />}
            disabled={reading}
            onClick={() => cameraRef.current?.click()}
          >
            Take photos of a printed list
          </Button>
          <p className="text-ui-sm text-ui-muted">
            We find the name, price, unit and code columns ourselves. You check every price before anything is saved.
          </p>
          {reading && state.progress ? (
            <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-ui-sm text-ui-muted">
              <span>
                {state.progress.total > 1 ? `Reading ${state.progress.index} of ${state.progress.total}. ` : "Reading. "}
                {state.progress.percent < 100 ? `Uploading ${state.progress.percent}%` : "Finding the prices…"}
              </span>
              <Button variant="ghost" size="sm" icon={<StopCircle weight="bold" />} onClick={state.cancelReading}>
                Stop
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      {state.error ? (
        <Callout tone="bad" title="That didn't work">
          <span data-testid="price-import-error">{state.error}</span>
        </Callout>
      ) : null}

      {(state.phase === "review" || state.phase === "saving") && state.parse ? (
        <Review state={state} taxRate={taxRate} taxLabel={taxLabel} currency={currency} />
      ) : null}

      {state.phase === "done" && state.summary ? <Done state={state} /> : null}

      <AiConsentModal open={state.consent.open} onGranted={state.consent.onGranted} />
    </div>
  );
}

function Review({
  state,
  taxRate,
  taxLabel,
  currency,
}: {
  state: ImportState;
  taxRate: number;
  taxLabel: string;
  currency: string;
}) {
  const parse = state.parse!;
  const source = state.source!;
  const [showColumns, setShowColumns] = useState(false);
  const saving = state.phase === "saving";
  const where = parse.source === "sheet" ? "Row" : "Line";
  const count = parse.valid.length;
  const fromLabel =
    source.kind === "table"
      ? source.fileName
      : source.files.length === 1
        ? source.files[0].name
        : `${source.files.length} photos`;
  const sameColumn = parse.mapping.name !== null && parse.mapping.name === parse.mapping.price;

  return (
    <>
      <Card as="section" padding="lg" className="space-y-2" aria-labelledby="price-import-check">
        <SectionTitle id="price-import-check" description={fromLabel}>
          Check your prices
        </SectionTitle>
        <p className="text-ui-base" data-testid="price-import-counts">
          {parse.needsMapping
            ? "Pick the name and price columns below to see the prices."
            : `${count} ${count === 1 ? "price" : "prices"} ready${
                parse.skipped.length > 0 ? `, ${parse.skipped.length} ${parse.skipped.length === 1 ? "row" : "rows"} left out` : ""
              }.`}
        </p>
      </Card>

      {source.kind === "document" && source.failed.length > 0 ? (
        <Callout tone="warn" title="Some pages couldn't be read">
          <p>The prices below are from the pages that worked.</p>
          <ul className="mt-2 space-y-2">
            {source.failed.map((f) => (
              <li key={f.index} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1">
                  {f.name}: {f.error}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ArrowClockwise weight="bold" />}
                  loading={state.retrying === f.index}
                  loadingLabel="Reading…"
                  disabled={state.retrying !== null}
                  onClick={() => void state.retryFailed(f.index)}
                >
                  Try again
                </Button>
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {source.kind === "table" && (parse.needsMapping || showColumns) ? (
        <Card as="section" padding="lg" className="space-y-4" aria-labelledby="price-import-columns">
          <SectionTitle
            id="price-import-columns"
            description="Pick the column that holds each one. The list below updates as you go."
          >
            Which column is which?
          </SectionTitle>
          {parse.needsMapping ? (
            <Callout tone="warn">We couldn&apos;t find the name or the price column in this file.</Callout>
          ) : null}
          <Toggle
            checked={!state.hasHeader}
            onChange={(value) => state.setHasHeader(!value)}
            label="The first row is a product, not headings"
          />
          {COLUMN_LABELS.map(({ key, label, required }) => (
            <ColumnSelect
              key={key}
              label={required ? label : `${label} (if the file has one)`}
              value={parse.mapping[key]}
              choices={state.choices}
              allowNone={!required}
              onChange={(index) => state.setColumn(key, index)}
              testId={`price-import-column-${key}`}
            />
          ))}
          {sameColumn ? <p className="text-ui-sm font-semibold text-ui-bad">Pick different columns for the name and the price.</p> : null}
        </Card>
      ) : source.kind === "table" ? (
        <Button variant="ghost" icon={<Columns weight="bold" />} onClick={() => setShowColumns(true)}>
          Change which columns are used
        </Button>
      ) : null}

      <Card as="section" padding="lg" className="space-y-4" aria-label="Price details">
        <Toggle
          checked={state.pricesIncludeGst}
          onChange={state.setPricesIncludeGst}
          label={`Prices include ${taxLabel}`}
          description={[parse.gst.reason, csvGstStatement(state.pricesIncludeGst, taxRate, taxLabel)].filter(Boolean).join(" ")}
          disabled={saving}
        />
        <TextField
          label="Supplier"
          hint="Saved on every price that doesn't name its own."
          placeholder={parse.supplier ?? "e.g. Kauri Timber Supplies"}
          value={state.supplierName}
          onChange={(event) => state.setSupplierName(event.target.value)}
          disabled={saving}
        />
      </Card>

      {parse.duplicates.length > 0 ? (
        <Callout tone="warn" title="Listed more than once">
          <ul className="space-y-1">
            {parse.duplicates.slice(0, 8).map((d) => (
              <li key={d.name}>
                “{d.name}” is on {where.toLowerCase()}s {d.rows.join(", ")}. The price from {where.toLowerCase()} {d.kept} is used.
              </li>
            ))}
          </ul>
          {parse.duplicates.length > 8 ? <p className="mt-1">And {parse.duplicates.length - 8} more.</p> : null}
        </Callout>
      ) : null}

      {parse.tooMany ? (
        <Callout tone="bad" title="That's more than 5,000 prices">
          Import up to 5,000 at a time. Split the file into parts and import each one.
        </Callout>
      ) : null}

      {count > 0 ? <Preview rows={parse.valid} currency={currency} /> : null}

      {parse.skipped.length > 0 ? (
        <Card padding="lg">
          <details>
            <summary className="ui-focus-ring flex min-h-12 cursor-pointer items-center gap-2 rounded-ui-md font-semibold">
              <CaretDown aria-hidden="true" weight="bold" />
              {parse.skipped.length} {parse.skipped.length === 1 ? "row" : "rows"} left out, and why
            </summary>
            <ul className="mt-2 space-y-1 text-ui-sm text-ui-muted" data-testid="price-import-skipped">
              {parse.skipped.slice(0, 100).map((s) => (
                <li key={`${s.row}-${s.reason}`}>
                  {where} {s.row}: {s.reason}
                  {s.raw ? ` (${s.raw.length > 60 ? `${s.raw.slice(0, 57)}…` : s.raw})` : ""}
                </li>
              ))}
            </ul>
          </details>
        </Card>
      ) : null}

      <div className="space-y-2">
        <Button
          fullWidth
          loading={saving}
          loadingLabel="Saving your prices…"
          disabled={count === 0 || parse.tooMany || parse.needsMapping || sameColumn}
          onClick={() => void state.save()}
          data-testid="price-import-save"
        >
          {count === 0 ? "Nothing to import yet" : `Import ${count} ${count === 1 ? "price" : "prices"}`}
        </Button>
        <Button variant="secondary" fullWidth icon={<ArrowCounterClockwise weight="bold" />} disabled={saving} onClick={state.reset}>
          Choose a different file
        </Button>
      </div>
    </>
  );
}

function Preview({ rows, currency }: { rows: PriceListRow[]; currency: string }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <ul className="divide-y divide-ui-line" aria-label="Prices to import" data-testid="price-import-preview">
        {rows.slice(0, PREVIEW_ROWS).map((r) => (
          <li key={r.row} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold break-words text-ui-text">{r.name}</p>
              <p className="text-ui-sm text-ui-muted">
                {[r.unit ? `per ${r.unit}` : "each", r.sku ? `code ${r.sku}` : null, r.supplier].filter(Boolean).join(" · ")}
              </p>
            </div>
            {r.default_unit_price === null ? (
              <StatusPill tone="warn">No price</StatusPill>
            ) : (
              <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(r.default_unit_price, currency, 4)}</span>
            )}
          </li>
        ))}
      </ul>
      {rows.length > PREVIEW_ROWS ? (
        <p className="border-t border-ui-line px-4 py-3 text-ui-sm text-ui-muted">
          And {rows.length - PREVIEW_ROWS} more.
        </p>
      ) : null}
    </Card>
  );
}

function Done({ state }: { state: ImportState }) {
  const summary = state.summary!;
  const tone = summary.tone === "bad" ? "bad" : summary.tone === "partial" ? "warn" : "ok";
  return (
    <section className="space-y-4" data-testid="price-import-done" data-tone={summary.tone}>
      <Callout tone={tone} title={summary.title}>
        <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
          {summary.counts.map((c) => (
            <div key={c.label} className="flex justify-between gap-2">
              <dt>{c.label}</dt>
              <dd className="font-semibold tabular-nums">{c.value}</dd>
            </div>
          ))}
        </dl>
      </Callout>
      {summary.skipped.length > 0 ? (
        <Card padding="lg" className="space-y-2">
          <SectionTitle as="h3">Not imported, and why</SectionTitle>
          <ul className="space-y-1 text-ui-sm text-ui-muted">
            {summary.skipped.slice(0, 100).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {summary.merged.length > 0 ? (
        <Card padding="lg" className="space-y-2">
          <SectionTitle as="h3">Saved once</SectionTitle>
          <ul className="space-y-1 text-ui-sm text-ui-muted">
            {summary.merged.slice(0, 50).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <div className="space-y-2">
        <ButtonLink href="/app/materials" fullWidth>
          Back to your prices
        </ButtonLink>
        <Button variant="secondary" fullWidth onClick={state.reset}>
          Import another list
        </Button>
      </div>
    </section>
  );
}

/** A pick-one list in the kit's field style (the kit has none yet). */
function ColumnSelect({
  label,
  value,
  choices,
  allowNone,
  onChange,
  testId,
}: {
  label: ReactNode;
  value: number | null;
  choices: ColumnChoice[];
  allowNone: boolean;
  onChange: (index: number | null) => void;
  testId?: string;
}) {
  const id = `column${useId().replace(/:/g, "")}`;
  return (
    <div className={UI_TEXT}>
      <label htmlFor={id} className="mb-2 block text-ui-base font-semibold text-ui-text">
        {label}
      </label>
      <div className="ui-focus-within-ring relative flex min-h-14 items-center rounded-ui-md border-2 border-ui-line-strong bg-ui-surface text-ui-lg text-ui-text">
        <select
          id={id}
          value={value === null ? "" : String(value)}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
          className={cx("ui-input-reset min-h-14 w-full min-w-0 cursor-pointer py-2 pr-12 pl-4")}
          data-testid={testId}
        >
          <option value="">{allowNone ? "None" : "Pick a column"}</option>
          {choices.map((c) => (
            <option key={c.index} value={c.index}>
              {c.sample ? `${c.label}: ${c.sample}` : c.label}
            </option>
          ))}
        </select>
        <CaretDown aria-hidden="true" weight="bold" className="pointer-events-none absolute right-4 text-[1.25rem] text-ui-muted" />
      </div>
    </div>
  );
}
