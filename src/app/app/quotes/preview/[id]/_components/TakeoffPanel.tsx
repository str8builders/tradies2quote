"use client";

import { useMemo, useState } from "react";
import { CaretDown, Calculator } from "@phosphor-icons/react/dist/ssr";
import {
  DEFAULTS,
  calculateMaterialTakeoff,
  type MaterialTakeoffInput,
  type MaterialTakeoffResult,
} from "@/lib/materialCalculator";
import type { TakeoffInputsSnapshot } from "@/lib/quote-types";

type Props = {
  onRecalculate: (result: MaterialTakeoffResult) => void;
  initialInputs?: TakeoffInputsSnapshot;
  isAccepted?: boolean;
};

/** The measurements as typed: the number boxes stay strings until worked out. */
export type TakeoffForm = {
  wallLengthM: string;
  wallHeightM: string;
  studSpacingMm: 400 | 600;
  numberOfDoors: string;
  numberOfWindows: string;
  gibSides: 1 | 2;
  includeInsulation: boolean;
  includeSkirting: boolean;
  includeArchitraves: boolean;
  wastePercent: string;
};

/** The form as it opens: the stored inputs, else the calculator's defaults. */
export function initialTakeoffForm(initial?: TakeoffInputsSnapshot): TakeoffForm {
  return {
    wallLengthM:
      initial?.wallLengthM !== undefined ? String(initial.wallLengthM) : "",
    wallHeightM: String(initial?.wallHeightM ?? DEFAULTS.wallHeightM),
    studSpacingMm: (initial?.studSpacingMm ?? DEFAULTS.studSpacingMm) as
      | 400
      | 600,
    numberOfDoors: String(initial?.numberOfDoors ?? 0),
    numberOfWindows: String(initial?.numberOfWindows ?? 0),
    gibSides: (initial?.gibSides ?? DEFAULTS.gibSides) as 1 | 2,
    includeInsulation: initial?.includeInsulation ?? DEFAULTS.includeInsulation,
    includeSkirting: initial?.includeSkirting ?? DEFAULTS.includeSkirting,
    includeArchitraves:
      initial?.includeArchitraves ?? DEFAULTS.includeArchitraves,
    wastePercent: String(initial?.wastePercent ?? DEFAULTS.wastePercent),
  };
}

function toNumber(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function summariseAssumptions(state: TakeoffForm): string {
  const parts: string[] = [];
  if (state.wallLengthM)
    parts.push(`${state.wallLengthM}m × ${state.wallHeightM}m`);
  parts.push(state.gibSides === 2 ? "GIB both sides" : "GIB one side");
  parts.push(`${state.studSpacingMm}mm centres`);
  const d = toNumber(state.numberOfDoors, 0);
  const w = toNumber(state.numberOfWindows, 0);
  if (d) parts.push(`${d} door${d === 1 ? "" : "s"}`);
  if (w) parts.push(`${w} window${w === 1 ? "" : "s"}`);
  if (state.includeSkirting) parts.push("skirting");
  if (state.includeArchitraves) parts.push("architraves");
  if (!state.includeInsulation) parts.push("no insulation");
  return parts.join(" · ");
}

/**
 * The calculator input the typed measurements make. The fallbacks apply only
 * to text that isn't a number: an empty box is Number("") = 0, so an empty
 * height or waste box sends 0, not the default (as Recalculate always has).
 */
export function takeoffFormInput(form: TakeoffForm): MaterialTakeoffInput {
  return {
    wallLengthM: toNumber(form.wallLengthM, 0),
    wallHeightM: toNumber(form.wallHeightM, DEFAULTS.wallHeightM),
    studSpacingMm: form.studSpacingMm,
    numberOfDoors: toNumber(form.numberOfDoors, 0),
    numberOfWindows: toNumber(form.numberOfWindows, 0),
    gibSides: form.gibSides,
    includeInsulation: form.includeInsulation,
    includeSkirting: form.includeSkirting,
    includeArchitraves: form.includeArchitraves,
    wastePercent: toNumber(form.wastePercent, DEFAULTS.wastePercent),
  };
}

/**
 * The measurements form: the typed sizes and choices, the calculator input
 * they make and the one-line summary. Both looks run on it (<TakeoffPanel>
 * below and the new job page's <MeasurementsSheet>), so they open on the same
 * stored inputs and work the materials out from the same numbers.
 */
export function useTakeoffForm(initialInputs?: TakeoffInputsSnapshot) {
  const [form, setForm] = useState<TakeoffForm>(() =>
    initialTakeoffForm(initialInputs),
  );
  const summary = useMemo(() => summariseAssumptions(form), [form]);
  const input = useMemo(() => takeoffFormInput(form), [form]);

  function update<K extends keyof TakeoffForm>(key: K, value: TakeoffForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return {
    form,
    update,
    summary,
    input,
    /** A wall length above 0: the classic Recalculate's gate. */
    ready: toNumber(form.wallLengthM, 0) > 0,
  };
}

export function TakeoffPanel({ onRecalculate, initialInputs, isAccepted }: Props) {
  const { form, update, summary, input, ready } = useTakeoffForm(initialInputs);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState<
    MaterialTakeoffResult["summary"] | null
  >(null);

  function handleRecalculate() {
    const result = calculateMaterialTakeoff(input);
    setWarnings(result.warnings);
    setLastSummary(result.summary);
    onRecalculate(result);
  }

  return (
    <section data-testid="takeoff-panel" className="t2q-card-pro">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-5 sm:p-6 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="inline-block h-6 w-1.5 shrink-0 rounded-full bg-brand"
              />
              <h3 className="font-display text-xl uppercase tracking-tight sm:text-2xl">
                Takeoff <span className="text-brand">assumptions</span>
              </h3>
            </div>
            <p
              data-testid="takeoff-summary-line"
              className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400"
            >
              {summary}
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 group-hover:text-white">
            <span data-testid="takeoff-edit-toggle">Edit assumptions</span>
            <CaretDown
              size={14}
              weight="bold"
              className="transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </span>
        </summary>

        <div className="border-t border-ink-700 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
          <p className="text-xs text-ink-400">
            Enter dimensions to calculate quantities. Prices stay blank — you
            enter them manually on each line.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberInput
              testId="takeoff-wall-length"
              label="Wall length (m)"
              value={form.wallLengthM}
              onChange={(v) => update("wallLengthM", v)}
              placeholder="e.g. 4"
            />
            <NumberInput
              testId="takeoff-wall-height"
              label="Wall height (m)"
              value={form.wallHeightM}
              onChange={(v) => update("wallHeightM", v)}
            />
            <SelectInput
              testId="takeoff-stud-spacing"
              label="Stud spacing (mm)"
              value={String(form.studSpacingMm)}
              onChange={(v) => update("studSpacingMm", Number(v) as 400 | 600)}
              options={[
                { value: "600", label: "600" },
                { value: "400", label: "400" },
              ]}
            />
            <NumberInput
              testId="takeoff-doors"
              label="Doors"
              value={form.numberOfDoors}
              onChange={(v) => update("numberOfDoors", v)}
              step="1"
            />
            <NumberInput
              testId="takeoff-windows"
              label="Windows"
              value={form.numberOfWindows}
              onChange={(v) => update("numberOfWindows", v)}
              step="1"
            />
            <SelectInput
              testId="takeoff-gib-sides"
              label="GIB sides"
              value={String(form.gibSides)}
              onChange={(v) => update("gibSides", Number(v) as 1 | 2)}
              options={[
                { value: "2", label: "2 (both sides)" },
                { value: "1", label: "1 (one side)" },
              ]}
            />
            <NumberInput
              testId="takeoff-waste"
              label="Waste %"
              value={form.wastePercent}
              onChange={(v) => update("wastePercent", v)}
              step="0.1"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-4">
            <Toggle
              testId="takeoff-include-insulation"
              label="Insulation"
              checked={form.includeInsulation}
              onChange={(v) => update("includeInsulation", v)}
            />
            <Toggle
              testId="takeoff-include-skirting"
              label="Skirting"
              checked={form.includeSkirting}
              onChange={(v) => update("includeSkirting", v)}
            />
            <Toggle
              testId="takeoff-include-architraves"
              label="Architraves"
              checked={form.includeArchitraves}
              onChange={(v) => update("includeArchitraves", v)}
            />
          </div>

          {warnings.length > 0 && (
            <ul
              data-testid="takeoff-warnings"
              className="mt-4 rounded-sm border border-hivis/40 bg-hivis/5 p-3 text-xs text-hivis"
            >
              {warnings.map((w, i) => (
                <li key={i} className="font-mono">
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}

          {lastSummary && (
            <p
              data-testid="takeoff-result-summary"
              className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-400"
            >
              Wall {lastSummary.wallAreaM2.toFixed(2)} m² · openings{" "}
              {lastSummary.openingAreaM2.toFixed(2)} m² · net{" "}
              {lastSummary.netWallAreaM2.toFixed(2)} m² · waste{" "}
              {lastSummary.wastePercent}%
            </p>
          )}

          <div className="mt-5 flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-500">
              {"// recalculate replaces material lines only — labour stays"}
            </p>
            <button
              type="button"
              data-testid="takeoff-recalculate"
              onClick={handleRecalculate}
              disabled={!ready || isAccepted}
              title={isAccepted ? "Quote already accepted." : undefined}
              className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Calculator size={18} weight="bold" />
              Recalculate Materials
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}

function NumberInput({
  testId,
  label,
  value,
  onChange,
  placeholder,
  step = "0.01",
}: {
  testId: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {label}
      </span>
      <input
        data-testid={testId}
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm tabular-nums text-white outline-none placeholder:text-ink-600 focus:border-brand"
      />
    </label>
  );
}

function SelectInput({
  testId,
  label,
  value,
  onChange,
  options,
}: {
  testId: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
        {label}
      </span>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-sm border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white outline-none focus:border-brand"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  testId,
  label,
  checked,
  onChange,
}: {
  testId: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-ink-300">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-brand"
      />
      {label}
    </label>
  );
}
