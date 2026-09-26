"use client";

import { useRef, useState } from "react";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Camera,
  CheckCircle,
  Download,
  Storefront,
  Upload,
  Warning,
} from "@phosphor-icons/react/dist/ssr";
import { REQUIRED_CSV_HEADERS, csvGstStatement } from "@/lib/materials";
import { PRICE_LIST_ACCEPT, type ColumnKey } from "@/lib/materials/priceList";
import { SUPPLIER_PRESETS } from "@/lib/supplier-presets";
import { AiConsentModal } from "@/app/app/quotes/new/_components/AiConsentModal";
import { usePriceListImport } from "../_lib/usePriceListImport";

const COLUMN_FIELDS: Array<{ key: ColumnKey; label: string; required: boolean }> = [
  { key: "name", label: "Name", required: true },
  { key: "price", label: "Price", required: true },
  { key: "unit", label: "Unit", required: false },
  { key: "code", label: "Code", required: false },
];

/**
 * The price-list import in the current look: a CSV / TXT, an Excel sheet,
 * a PDF or photos of a printed list — all into the same review, then an
 * honest summary. The logic is shared with the new look
 * (../_lib/usePriceListImport.ts).
 */
export function ImportClient({
  taxRate = 0.15,
  taxLabel = "GST",
  needsAiConsent = false,
}: {
  /** Fraction, e.g. 0.15. */
  taxRate?: number;
  /** The tradie's own tax label ("GST", "VAT", "Tax"). */
  taxLabel?: string;
  /** iPhone app with no AI consent on record: ask before a PDF or photo is read. */
  needsAiConsent?: boolean;
}) {
  const state = usePriceListImport({ needsAiConsent });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const activePreset = SUPPLIER_PRESETS.find((p) => p.id === state.presetId) ?? SUPPLIER_PRESETS[0];
  const parse = state.parse;
  const source = state.source;
  const reading = state.phase === "reading";
  const saving = state.phase === "saving";
  const where = parse?.source === "document" ? "Line" : "Row";
  const fileLabel =
    source?.kind === "table"
      ? source.fileName
      : source?.kind === "document"
        ? source.files.length === 1
          ? source.files[0].name
          : `${source.files.length} photos`
        : "";

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setShowColumns(false);
    void state.readFiles(files);
  };

  return (
    <div className="space-y-6">
      {/* Wave 16 — supplier-preset picker. Every preset's column names are
          understood anyway; picking one tries its names first and fills in
          its supplier on every row. */}
      <section
        data-testid="import-supplier-preset"
        className="t2q-card-pro p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
              {"// step 1"}
            </p>
            <h2 className="mt-1 font-display text-lg uppercase tracking-tight">
              Where&apos;s the list from?
            </h2>
            <p className="mt-2 text-sm text-ink-300">
              Pick your supplier. We translate their column names automatically — no
              renaming columns by hand.
            </p>
          </div>
          <Storefront size={22} weight="bold" className="hidden text-ink-400 sm:block" />
        </div>

        <div
          role="radiogroup"
          aria-label="Supplier preset"
          className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
        >
          {SUPPLIER_PRESETS.map((p) => {
            const active = p.id === state.presetId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                data-testid={`supplier-preset-${p.id}`}
                onClick={() => state.setPresetId(p.id)}
                className={`group flex min-h-11 flex-col items-start gap-1 rounded-sm border px-3 py-2.5 text-left transition-colors ${
                  active
                    ? "border-brand bg-brand/10 text-white"
                    : "border-ink-700 bg-ink-900/40 text-ink-200 hover:border-brand/60 hover:bg-brand/5"
                }`}
              >
                <span
                  className={`font-mono text-[9px] uppercase tracking-[0.18em] ${
                    active ? "text-brand" : "text-ink-400"
                  }`}
                >
                  {active ? "active" : "tap to use"}
                </span>
                <span className="font-display text-sm uppercase tracking-tight leading-tight">
                  {p.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
          {activePreset.hint}
        </p>

        {/* Quick links to each merchant's trade portal, to grab the export. */}
        <div
          data-testid="supplier-quick-links"
          className="mt-4 border-t border-ink-700/40 pt-3"
        >
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
            {"// need to grab your price list? open a supplier site"}
          </p>
          <div className="flex flex-wrap gap-2">
            {SUPPLIER_PRESETS.filter((p) => p.portalUrl).map((p) => (
              <a
                key={p.id}
                href={p.portalUrl ?? "#"}
                target="_blank"
                rel="noreferrer noopener"
                data-testid={`supplier-link-${p.id}`}
                className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-900/40 px-3 py-1.5 text-[11px] font-display uppercase tracking-tight text-ink-200 transition-colors hover:border-brand hover:text-brand"
              >
                {p.shortLabel}
                <ArrowSquareOut size={11} weight="bold" aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="t2q-card-pro p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
              {"// step 2"}
            </p>
            <h2 className="mt-1 font-display text-lg uppercase tracking-tight">
              {activePreset.id === "generic"
                ? "No export? Use our template"
                : "Or use our template"}
            </h2>
          </div>
          <a
            href="/materials-template.csv"
            download
            data-testid="csv-template-download"
            className="t2q-btn-ghost-pro"
          >
            <Download size={18} weight="bold" />
            Template
          </a>
        </div>
        <p className="mt-3 text-sm text-ink-300">
          Needs a <code className="text-white">{REQUIRED_CSV_HEADERS[0]}</code> and a price column
          (Nett, Trade, Price ex GST, Unit Price…). Unit, code, supplier, link and notes are optional.
          Title lines above the header are fine.
        </p>
      </section>

      <section className="t2q-card-pro p-5 sm:p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          {"// step 3"}
        </p>
        <h2 className="mt-1 font-display text-lg uppercase tracking-tight">
          Upload your price list
        </h2>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-dashed border-ink-700 bg-ink-900 p-8 text-center transition-colors hover:border-brand">
          <Upload size={28} weight="bold" className="text-ink-400" />
          <span className="mt-3 font-display text-sm uppercase tracking-tight">
            {reading ? "Reading…" : fileLabel || "Choose a CSV, Excel file, PDF or photos"}
          </span>
          <span className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-ink-500">
            {fileLabel ? "// tap to change" : "// csv · xlsx · pdf · photos"}
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept={PRICE_LIST_ACCEPT}
            multiple
            disabled={reading}
            data-testid="csv-file-input"
            onChange={onPicked}
            className="hidden"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={reading}
            className="t2q-btn-ghost-pro inline-flex h-11 px-5 disabled:opacity-50"
          >
            <Camera size={18} weight="bold" />
            Take photos of a printed list
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            multiple
            className="sr-only"
            onChange={onPicked}
          />
          {reading && state.progress ? (
            <span role="status" className="text-sm text-ink-300">
              {state.progress.total > 1 ? `Reading ${state.progress.index} of ${state.progress.total} · ` : ""}
              {state.progress.percent < 100 ? `Uploading ${state.progress.percent}%` : "Finding the prices…"}
              <button type="button" onClick={state.cancelReading} className="ml-3 min-h-11 px-3 underline">
                Stop
              </button>
            </span>
          ) : null}
        </div>

        {state.error && (
          <p role="alert" data-testid="csv-error" className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {state.error}
          </p>
        )}
      </section>

      {parse && source && (state.phase === "review" || state.phase === "saving") && (
        <section className="t2q-card-pro p-5 sm:p-6">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
            {"// step 4"}
          </p>
          <h2 className="mt-1 font-display text-lg uppercase tracking-tight">
            Review &amp; import
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat
              testId="csv-valid-count"
              icon={<CheckCircle size={16} weight="bold" />}
              label="Ready to import"
              value={parse.valid.length}
              accent="brand"
            />
            <Stat
              testId="csv-invalid-count"
              icon={<Warning size={16} weight="bold" />}
              label="Skipped"
              value={parse.skipped.length}
              accent="hivis"
            />
          </div>

          {source.kind === "document" && source.failed.length > 0 && (
            <div className="mt-4 rounded-sm border border-red-500/40 bg-red-500/5 p-3" data-testid="csv-failed-pages">
              <p className="text-xs font-semibold text-red-200">Some pages couldn&apos;t be read — the prices below are from the pages that worked.</p>
              <ul className="mt-2 space-y-2">
                {source.failed.map((f) => (
                  <li key={f.index} className="flex flex-wrap items-center gap-2 text-xs text-ink-200">
                    <span className="min-w-0 flex-1">{f.name}: {f.error}</span>
                    <button
                      type="button"
                      onClick={() => void state.retryFailed(f.index)}
                      disabled={state.retrying !== null}
                      className="t2q-btn-ghost-pro inline-flex h-11 px-4 disabled:opacity-50"
                    >
                      <ArrowsClockwise size={16} weight="bold" />
                      {state.retrying === f.index ? "Reading…" : "Try again"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {source.kind === "table" && (parse.needsMapping || showColumns) ? (
            <div className="mt-4 rounded-sm border border-ink-700 p-3" data-testid="csv-column-mapping">
              <p className="text-sm font-semibold text-white">Which column is which?</p>
              {parse.needsMapping && (
                <p className="mt-1 text-xs text-hivis">We couldn&apos;t find the name or the price column. Pick them here — the preview updates as you go.</p>
              )}
              <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-200">
                <input
                  type="checkbox"
                  checked={!state.hasHeader}
                  onChange={(e) => state.setHasHeader(!e.target.checked)}
                  className="h-4 w-4 accent-brand"
                />
                The first row is a product, not headings
              </label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {COLUMN_FIELDS.map(({ key, label, required }) => (
                  <label key={key} className="block text-xs text-ink-300">
                    {required ? label : `${label} (optional)`}
                    <select
                      value={parse.mapping[key] === null ? "" : String(parse.mapping[key])}
                      onChange={(e) => state.setColumn(key, e.target.value === "" ? null : Number(e.target.value))}
                      data-testid={`csv-column-${key}`}
                      className="mt-1 block min-h-11 w-full rounded-sm border border-ink-700 bg-ink-900 px-2 text-sm text-white"
                    >
                      <option value="">{required ? "Pick a column" : "None"}</option>
                      {state.choices.map((c) => (
                        <option key={c.index} value={c.index}>
                          {c.sample ? `${c.label}: ${c.sample}` : c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          ) : source.kind === "table" ? (
            <button
              type="button"
              onClick={() => setShowColumns(true)}
              className="mt-3 min-h-11 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
            >
              Change which columns are used
            </button>
          ) : null}

          <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-200">
            <input
              type="checkbox"
              checked={state.pricesIncludeGst}
              onChange={(e) => state.setPricesIncludeGst(e.target.checked)}
              disabled={saving}
              data-testid="csv-prices-include-gst"
              className="h-4 w-4 accent-brand"
            />
            Prices in this file include {taxLabel}
          </label>
          {parse.gst.reason && (
            <p data-testid="csv-gst-detected" className="mt-1 text-xs text-hivis">
              {parse.gst.reason}
            </p>
          )}
          <p data-testid="csv-gst-basis" className="mt-1 text-xs text-ink-300">
            {csvGstStatement(state.pricesIncludeGst, taxRate, taxLabel)}
          </p>

          <label className="mt-4 block text-xs text-ink-300">
            Supplier (for rows that don&apos;t name one)
            <input
              type="text"
              value={state.supplierName}
              onChange={(e) => state.setSupplierName(e.target.value)}
              placeholder={parse.supplier ?? activePreset.defaultSupplier ?? "e.g. Kauri Timber Supplies"}
              disabled={saving}
              className="mt-1 block min-h-11 w-full rounded-sm border border-ink-700 bg-ink-900 px-3 text-sm text-white outline-none focus:border-brand"
            />
          </label>

          {(() => {
            const unpriced = parse.valid.filter((r) => r.default_unit_price === null).length;
            if (unpriced === 0) return null;
            return (
              <p data-testid="csv-unpriced" className="mt-2 text-xs text-hivis">
                {unpriced} row{unpriced === 1 ? " has" : "s have"} no price (blank or POA) —
                imported without one. Existing library prices are kept.
              </p>
            );
          })()}

          {parse.duplicates.length > 0 && (
            <ul className="mt-4 rounded-sm border border-hivis/40 bg-hivis/5 p-3 text-xs text-hivis" data-testid="csv-duplicates">
              {parse.duplicates.slice(0, 8).map((d) => (
                <li key={d.name}>
                  “{d.name}” is on {where.toLowerCase()}s {d.rows.join(", ")} — the price from {where.toLowerCase()} {d.kept} is used.
                </li>
              ))}
              {parse.duplicates.length > 8 && <li>…and {parse.duplicates.length - 8} more.</li>}
            </ul>
          )}

          {parse.tooMany && (
            <p className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              That&apos;s more than 5,000 prices. Import up to 5,000 at a time: split the file into parts.
            </p>
          )}

          {parse.skipped.length > 0 && (
            <ul className="mt-4 max-h-48 overflow-auto rounded-sm border border-hivis/40 bg-hivis/5 p-3 text-xs text-hivis">
              {parse.skipped.map((r, i) => (
                <li key={i} className="font-mono">
                  {where} {r.row}: {r.reason}
                </li>
              ))}
            </ul>
          )}

          {parse.valid.length > 0 && (
            <div className="mt-4 max-h-64 overflow-auto rounded-sm border border-ink-700">
              <table className="w-full text-left text-sm">
                <thead className="bg-ink-800 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-400">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Unit</th>
                    <th className="px-3 py-2 text-right">Price</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Supplier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-700">
                  {parse.valid.slice(0, 50).map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-white">{r.name}</td>
                      <td className="px-3 py-2 text-ink-300">{r.unit ?? "each"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-white">
                        {r.default_unit_price === null
                          ? "—"
                          : formatCsvPrice(r.default_unit_price)}
                      </td>
                      <td className="px-3 py-2 text-ink-300">{r.sku ?? "—"}</td>
                      <td className="px-3 py-2 text-ink-300">{r.supplier ?? "—"}</td>
                    </tr>
                  ))}
                  {parse.valid.length > 50 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-2 text-center font-mono text-xs uppercase tracking-[0.2em] text-ink-500"
                      >
                        {`// + ${parse.valid.length - 50} more rows`}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setShowColumns(false);
                state.reset();
              }}
              disabled={saving}
              className="min-h-11 font-mono text-xs uppercase tracking-[0.2em] text-ink-300 hover:text-white"
            >
              ← Choose a different file
            </button>
            <button
              type="button"
              data-testid="csv-import-confirm"
              disabled={parse.valid.length === 0 || parse.tooMany || parse.needsMapping || saving}
              onClick={() => void state.save()}
              className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving
                ? "Importing…"
                : `Import ${parse.valid.length} row${parse.valid.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </section>
      )}

      {state.phase === "done" && state.summary && (
        <section
          data-testid="import-result"
          data-tone={state.summary.tone}
          className={`t2q-card-pro p-5 sm:p-6 ${state.summary.tone === "bad" ? "border-red-500/50" : ""}`}
        >
          <h2 className="font-display text-lg uppercase tracking-tight">{state.summary.title}.</h2>
          <p className="mt-2 text-sm text-white">
            {state.summary.counts.map((c, i) => (
              <span key={c.label}>
                {i > 0 ? " · " : ""}
                {c.label} <strong className={c.label === "Skipped" && c.value > 0 ? "text-hivis" : "text-brand"}>{c.value}</strong>
              </span>
            ))}
          </p>
          {state.summary.skipped.length > 0 && (
            <ul className="mt-3 max-h-48 overflow-auto rounded-sm border border-hivis/40 bg-hivis/5 p-3 text-xs text-hivis">
              {state.summary.skipped.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {state.summary.merged.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-ink-300">
              {state.summary.merged.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <a href="/app/materials" className="t2q-btn-primary-pro inline-flex h-11 px-5">
              View library
            </a>
            <button type="button" onClick={state.reset} className="t2q-btn-ghost-pro inline-flex h-11 px-5">
              Import another list
            </button>
          </div>
        </section>
      )}

      <AiConsentModal open={state.consent.open} onGranted={state.consent.onGranted} />
    </div>
  );
}

/** Two decimals, but never hide a sub-cent price (0.125 stays 0.125). */
function formatCsvPrice(n: number): string {
  return Number.isInteger(n * 100) ? n.toFixed(2) : String(n);
}

function Stat({
  icon,
  label,
  value,
  accent,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "brand" | "hivis";
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className={[
        "rounded-sm border px-3 py-2",
        accent === "brand"
          ? "border-brand/40 bg-brand/10"
          : "border-hivis/40 bg-hivis/10",
      ].join(" ")}
    >
      <div
        className={[
          "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em]",
          accent === "brand" ? "text-brand" : "text-hivis",
        ].join(" ")}
      >
        {icon}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}
