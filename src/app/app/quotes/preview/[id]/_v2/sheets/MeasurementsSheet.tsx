"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusPill } from "@/components/ui/status-pill";
import { NumberField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { QUOTE_LOCKED_MESSAGE } from "@/lib/lifecycle/lock";
import {
  calculateMaterialTakeoff,
  type MaterialTakeoffInput,
  type MaterialTakeoffResult,
} from "@/lib/materialCalculator";
import { formatQuantity } from "@/lib/quantity-display";
import type { LibraryMaterial, QuoteData, TakeoffEvaluationSummary } from "@/lib/quote-types";
import {
  libraryMaterials,
  measurementsPatch,
  pricedMaterialLines,
  takeoffLinesPreview,
  type LibraryRow,
  type MeasurementsPatch,
  type TakeoffPreviewRow,
} from "@/lib/takeoffLines";
import { takeoffFormInput, useTakeoffForm, type TakeoffForm } from "../../_components/TakeoffPanel";
import { quantityText, saveErrorMessage } from "../lines";

type Box = "wallLengthM" | "wallHeightM" | "numberOfDoors" | "numberOfWindows";

export interface MeasurementsCheck {
  input: MaterialTakeoffInput;
  /** Plain words for each box that can't be worked out from yet. */
  problems: Partial<Record<Box, string>>;
  /** The worked-out materials; null until every box can be used. */
  result: MaterialTakeoffResult | null;
  /** What applying writes; null while there is nothing to write. */
  patch: MeasurementsPatch | null;
  /** Each new material line beside the one it replaces, then the lines that come off. */
  rows: TakeoffPreviewRow[];
  /** Material lines whose prices come off with them. */
  pricesCleared: number;
}

/**
 * The sheet's whole picture for what's typed: the classic panel's own
 * calculator input and rules (takeoffFormInput, lib/takeoffLines), plus plain
 * words for a box the calculator would refuse.
 */
export function checkMeasurements(data: QuoteData, form: TakeoffForm, library: LibraryMaterial[]): MeasurementsCheck {
  const input = takeoffFormInput(form);
  const problems: MeasurementsCheck["problems"] = {};
  if (!(input.wallLengthM > 0)) {
    problems.wallLengthM = form.wallLengthM.trim() ? "Add a length bigger than 0." : "Add the wall length.";
  }
  if (!((input.wallHeightM ?? 0) > 0)) problems.wallHeightM = "Add a height bigger than 0.";
  if (!Number.isInteger(input.numberOfDoors)) problems.numberOfDoors = "Use a whole number.";
  if (!Number.isInteger(input.numberOfWindows)) problems.numberOfWindows = "Use a whole number.";
  const result = Object.keys(problems).length === 0 ? calculateMaterialTakeoff(input) : null;
  const patch = result ? measurementsPatch(data.line_items, result, input, library) : null;
  return {
    input,
    problems,
    result,
    patch,
    rows: patch ? takeoffLinesPreview(data.line_items, patch.line_items.filter((line) => line.type === "material")) : [],
    pricesCleared: pricedMaterialLines(data.line_items),
  };
}

const m2 = (value: number) => `${formatQuantity(value)} m²`;

/** "Wall area 11.52 m², 8.4 m² without the doors and windows, plus 10% for waste." */
export function areaWords(summary: MaterialTakeoffResult["summary"]): string {
  const parts = [`Wall area ${m2(summary.wallAreaM2)}`];
  if (summary.openingAreaM2 > 0) parts.push(`${m2(summary.netWallAreaM2)} without the doors and windows`);
  const waste = summary.wastePercent > 0 ? `, plus ${formatQuantity(summary.wastePercent)}% for waste` : "";
  return `${parts.join(", ")}${waste}.`;
}

/** "2 changed, 5 new, 1 coming off." */
export function changeWords(rows: readonly TakeoffPreviewRow[]): string {
  const count = (change: TakeoffPreviewRow["change"]) => rows.filter((row) => row.change === change).length;
  const parts = [
    count("changed") > 0 ? `${count("changed")} changed` : null,
    count("added") > 0 ? `${count("added")} new` : null,
    count("removed") > 0 ? `${count("removed")} coming off` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `${parts.join(", ")}.` : "No change to your material lines.";
}

/** Under a new line: what the quote has now (and that its price comes off with it). */
export function rowSubtitle(row: TakeoffPreviewRow): string {
  switch (row.change) {
    case "added":
      return "New line";
    case "removed":
      return `Currently ${quantityText(row.line)}`;
    default: {
      const priced = (Number(row.before.unit_price) || 0) > 0;
      if (row.change === "same") return priced ? "Same count. Its price comes off." : "No change";
      return `Currently ${quantityText(row.before)}${priced ? ". Its price comes off." : ""}`;
    }
  }
}

function PreviewRow({ row }: { row: TakeoffPreviewRow }) {
  const blocked = row.change !== "removed" && row.line.takeoff_status === "blocked";
  const subtitle = rowSubtitle(row);
  const trailing =
    row.change === "removed" ? (
      <StatusPill>Comes off</StatusPill>
    ) : blocked ? (
      <StatusPill tone="warn">No count yet</StatusPill>
    ) : (
      quantityText(row.line)
    );
  return <ListRow title={row.line.description?.trim() || "Untitled line"} subtitle={subtitle} trailing={trailing} />;
}

/** What the evaluator makes of the new lines, next to what it said before. */
function CheckCallout({ fresh, before }: { fresh: TakeoffEvaluationSummary; before?: TakeoffEvaluationSummary }) {
  const reasons = (
    <ul className="list-disc space-y-1 pl-5">
      {fresh.reasons.map((reason, i) => (
        <li key={`${i}-${reason}`}>{reason}</li>
      ))}
    </ul>
  );
  if (fresh.status === "fail") {
    return (
      <Callout tone="bad" title="These numbers don't look right">
        {reasons}
        <p className="mt-2">The quote can&apos;t be sent with them. Check the sizes.</p>
      </Callout>
    );
  }
  if (fresh.status === "caution") {
    return (
      <Callout tone="warn" title="Check these before you send">
        {reasons}
        <p className="mt-2">You&apos;ll be asked to confirm them when you send.</p>
      </Callout>
    );
  }
  if (before?.status === "fail") {
    return (
      <Callout tone="ok" title="These pass the quantity check">
        They replace the check that was stopping this quote being sent.
      </Callout>
    );
  }
  if (before?.status === "caution") return <Callout tone="ok" title="These pass the quantity check" />;
  return null;
}

export interface MeasurementsSheetViewProps {
  /** The quote the sheet opened on: the lines the new materials replace. */
  data: QuoteData;
  form: TakeoffForm;
  /** The library the new lines link to (their prices stay blank). */
  library: LibraryMaterial[];
  /** Apply was tapped: point at any box that can't be used. */
  tried: boolean;
  busy: boolean;
  error: string | null;
  /** Accepted or later: nothing can change. */
  locked: boolean;
  onChange: <K extends keyof TakeoffForm>(key: K, value: TakeoffForm[K]) => void;
  onApply: () => void;
  onClose: () => void;
}

const SPACINGS = [
  { value: "600", label: "600 mm" },
  { value: "400", label: "400 mm" },
] as const;

const SIDES = [
  { value: "2", label: "Both sides" },
  { value: "1", label: "One side" },
] as const;

/**
 * The wall's measurements, the materials they work out to beside the lines
 * on the quote now, and one button that swaps them in (labour and other lines
 * stay). The quantity check is re-run on the new lines as they're typed.
 */
export function MeasurementsSheetView({
  data,
  form,
  library,
  tried,
  busy,
  error,
  locked,
  onChange,
  onApply,
  onClose,
}: MeasurementsSheetViewProps) {
  const check = checkMeasurements(data, form, library);
  const { result, patch, problems } = check;
  const off = busy || locked;
  const shown = (box: Box) => (tried ? problems[box] : undefined);
  const blocked = patch?.line_items.filter((line) => line.type === "material" && line.takeoff_status === "blocked") ?? [];
  const insulationBlocked = blocked.some((line) => /insulation/i.test(line.description ?? ""));
  const otherBlocked = blocked.filter((line) => !/insulation/i.test(line.description ?? ""));
  const refused = result !== null && patch === null;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Measurements"
      description="Type the wall sizes and we work the materials out again."
      footer={
        <Button
          fullWidth
          data-testid="job-measurements-apply"
          loading={busy}
          loadingLabel="Saving…"
          disabled={locked}
          onClick={onApply}
        >
          Use these materials
        </Button>
      }
    >
      <div className="space-y-5" data-testid="job-measurements" data-ready={patch ? "true" : "false"}>
        {locked ? <Callout tone="info" title="This quote has been accepted, so its lines can't change now." /> : null}
        <NumberField
          label="Wall length"
          value={form.wallLengthM}
          onValueChange={(value) => onChange("wallLengthM", value)}
          suffix="m"
          decimals={2}
          disabled={off}
          data-box="wallLengthM"
          hint="All the walls added together."
          error={shown("wallLengthM")}
        />
        <NumberField
          label="Wall height"
          value={form.wallHeightM}
          onValueChange={(value) => onChange("wallHeightM", value)}
          suffix="m"
          decimals={2}
          disabled={off}
          data-box="wallHeightM"
          error={shown("wallHeightM")}
        />
        <SegmentedControl
          label="Stud spacing"
          options={SPACINGS}
          value={form.studSpacingMm === 400 ? "400" : "600"}
          onChange={(value) => onChange("studSpacingMm", value === "400" ? 400 : 600)}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Doors"
            value={form.numberOfDoors}
            onValueChange={(value) => onChange("numberOfDoors", value)}
            decimals={0}
            disabled={off}
            data-box="numberOfDoors"
            error={shown("numberOfDoors")}
          />
          <NumberField
            label="Windows"
            value={form.numberOfWindows}
            onValueChange={(value) => onChange("numberOfWindows", value)}
            decimals={0}
            disabled={off}
            data-box="numberOfWindows"
            error={shown("numberOfWindows")}
          />
        </div>
        <SegmentedControl
          label="GIB lining"
          options={SIDES}
          value={form.gibSides === 1 ? "1" : "2"}
          onChange={(value) => onChange("gibSides", value === "1" ? 1 : 2)}
        />
        <NumberField
          label="Waste allowance"
          value={form.wastePercent}
          onValueChange={(value) => onChange("wastePercent", value)}
          suffix="%"
          decimals={1}
          disabled={off}
          data-box="wastePercent"
        />
        <section aria-labelledby="job-measurements-include">
          <h3 id="job-measurements-include" className="font-semibold">
            What to include
          </h3>
          <div className="divide-y divide-ui-line">
            <Toggle
              label="Insulation"
              description="Outside walls only."
              checked={form.includeInsulation}
              onChange={(value) => onChange("includeInsulation", value)}
              disabled={off}
            />
            <Toggle
              label="Skirting"
              checked={form.includeSkirting}
              onChange={(value) => onChange("includeSkirting", value)}
              disabled={off}
            />
            <Toggle
              label="Architraves"
              checked={form.includeArchitraves}
              onChange={(value) => onChange("includeArchitraves", value)}
              disabled={off}
            />
          </div>
        </section>
        <section aria-labelledby="job-measurements-materials" className="space-y-3">
          <h3 id="job-measurements-materials" className="font-semibold">
            Materials with these measurements
          </h3>
          {patch && result ? (
            <>
              <p className="text-ui-sm text-ui-muted">{areaWords(result.summary)}</p>
              <Card padding="none">
                <ul className="divide-y divide-ui-line">
                  {check.rows.map((row, i) => (
                    <li key={`${i}-${row.line.description}`} data-change={row.change}>
                      <PreviewRow row={row} />
                    </li>
                  ))}
                </ul>
              </Card>
              <p className="text-ui-sm text-ui-muted" aria-live="polite">
                {changeWords(check.rows)}
              </p>
            </>
          ) : refused ? (
            <Callout tone="bad" title="These sizes can't be worked out.">
              Check them and try again.
            </Callout>
          ) : (
            <p className="text-ui-sm text-ui-muted">Add the wall length and height to see the materials.</p>
          )}
        </section>
        {patch && result ? (
          <>
            {check.pricesCleared > 0 ? (
              <Callout
                tone="warn"
                title={`This takes the prices off ${check.pricesCleared} material ${check.pricesCleared === 1 ? "line" : "lines"}.`}
              >
                The new lines come in without prices, for you to fill in. Labour and other lines stay as they are.
              </Callout>
            ) : (
              <Callout tone="info" title="The new lines come in without prices.">
                You fill them in after. Labour and other lines stay as they are.
              </Callout>
            )}
            {insulationBlocked ? (
              <Callout tone="warn" title="Insulation can't be worked out here.">
                It&apos;s for outside walls only, and this doesn&apos;t ask for their length. Turn insulation off, or
                type the pack count on its line after. The quote can&apos;t be sent until it has one.
              </Callout>
            ) : null}
            {otherBlocked.map((line) => (
              <Callout key={line.description} tone="warn" title={`${line.description} can't be worked out here.`}>
                Type its quantity on its line after, or take it off.
              </Callout>
            ))}
            {result.summary.netWallAreaM2 === 0 ? (
              <Callout tone="warn" title="The doors and windows take up the whole wall.">
                So there&apos;s no GIB to put up. Check the wall size and the number of doors and windows.
              </Callout>
            ) : null}
            <CheckCallout fresh={patch.takeoff_evaluation} before={data.takeoff_evaluation} />
          </>
        ) : null}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

export interface MeasurementsSheetProps {
  /** The quote as the page shows it: its lines and its stored measurements (takeoff_inputs). */
  data: QuoteData;
  /**
   * Saves the patch: line_items with every material line replaced, and
   * takeoff_evaluation, the quantity check re-run on the new lines.
   */
  onApply: (patch: Partial<QuoteData>) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
  /** Accepted or later: the lines can't change. */
  locked?: boolean;
  /**
   * The tradie's material library (the page's rows): the new lines link to a
   * matching row like the classic editor's do. Prices stay blank either way.
   */
  library?: readonly LibraryRow[];
}

/**
 * Work the materials out again from the wall's measurements without leaving
 * the job: the classic editor's "Takeoff assumptions" panel in the new look,
 * with its form (useTakeoffForm) and its line rules (lib/takeoffLines).
 */
export function MeasurementsSheet({ data, onApply, onClose, locked = false, library }: MeasurementsSheetProps) {
  // The quote as it opened: the page behind takes the new lines the moment
  // the button is tapped, and the sheet shouldn't change under the thumb.
  const [opened] = useState(data);
  const [materials] = useState(() => libraryMaterials(library ?? []));
  const { form, update } = useTakeoffForm(opened.takeoff_inputs);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (locked || busy) return;
    setTried(true);
    const { patch } = checkMeasurements(opened, form, materials);
    if (!patch) return;
    setBusy(true);
    setError(null);
    let result: { ok: true } | { error: string };
    try {
      result = await onApply(patch);
    } catch {
      result = { error: saveErrorMessage("network", QUOTE_LOCKED_MESSAGE) };
    }
    setBusy(false);
    if ("error" in result) setError(result.error);
  }

  return (
    <MeasurementsSheetView
      data={opened}
      form={form}
      library={materials}
      tried={tried}
      busy={busy}
      error={error}
      locked={locked}
      onChange={update}
      onApply={apply}
      onClose={onClose}
    />
  );
}
