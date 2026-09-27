"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { NumberField } from "@/components/ui/text-field";
import type { ConfirmAndRecalcResult, DimensionEdit } from "@/lib/dimensionConfirmation";
import { dimensionDraft, type DimensionDraft } from "@/lib/dimensionConfirmationForm";
import type { QuoteData } from "@/lib/quote-types";
import { quantityText } from "../lines";
import { checkSizes, sizeHint, sizeReasons } from "../sizes";

export interface SizesSheetViewProps {
  /** The quote the sheet opened on: its lines and the sizes to check. */
  data: QuoteData;
  draft: DimensionDraft;
  /** Save was tapped: point at any size still missing. */
  tried: boolean;
  busy: boolean;
  error: string | null;
  onType: (key: string, value: string) => void;
  onSave: () => void;
  onClose: () => void;
}

/**
 * The sizes read off the drawing, one box each with its unit, the materials
 * worked out again as soon as a size changes, and one button that confirms
 * them all (the send gate wants every size confirmed).
 */
export function SizesSheetView({ data, draft, tried, busy, error, onType, onSave, onClose }: SizesSheetViewProps) {
  const check = checkSizes(data, draft);
  const reasons = sizeReasons(data.dimension_confirmation?.reasons);
  const problem = check.preview?.problem;
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Check the sizes"
      description="We read these off your drawing and worked out the materials from them. Fix any that are wrong."
      footer={
        <Button fullWidth data-testid="job-sizes-save" loading={busy} loadingLabel="Saving…" onClick={onSave}>
          {check.edited ? "Save the new sizes" : "Yes, the sizes are right"}
        </Button>
      }
    >
      <div className="space-y-5" data-testid="job-sizes" data-edited={check.edited}>
        {reasons.length > 0 ? (
          <Callout tone="info" title="Why we're asking">
            <ul className="list-disc space-y-1 pl-5">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {check.sizes.map((size) => (
          <NumberField
            key={size.key}
            label={size.label}
            value={draft[size.key] ?? ""}
            onValueChange={(value) => onType(size.key, value)}
            decimals={3}
            suffix={size.unit}
            disabled={busy}
            data-size={size.key}
            hint={sizeHint(size, draft[size.key])}
            error={tried && check.invalid.includes(size.key) ? "Add a size bigger than 0." : undefined}
          />
        ))}
        <div aria-live="polite">{problem ? <Callout tone="bad" title={problem} /> : null}</div>
        {check.rows.length > 0 ? (
          <section aria-labelledby="job-sizes-materials" className="space-y-2">
            <h3 id="job-sizes-materials" className="font-semibold">
              Materials with the new sizes
            </h3>
            <Card padding="none">
              <ul className="divide-y divide-ui-line">
                {check.rows.map(({ line, before, changed }, i) => (
                  <li key={`${i}-${line.description}`} data-changed={changed}>
                    <ListRow
                      title={line.description?.trim() || "Untitled line"}
                      subtitle={changed && before ? `Was ${quantityText(before)}` : undefined}
                      trailing={quantityText(line)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
            <p className="text-ui-sm text-ui-muted">Your prices stay as they are.</p>
          </section>
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

export interface SizesSheetProps {
  /** The quote as the page shows it: its lines and the sizes to check. */
  data: QuoteData;
  /** Saves through confirmDimensions; `preview` is what that will do, for the page to show at once. */
  onConfirm: (edits: DimensionEdit[], preview: ConfirmAndRecalcResult | null) => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
}

/**
 * Check the sizes read off a drawing without leaving the job: the classic
 * editor's "confirm key dimensions" panel in the new look, with its rules.
 */
export function SizesSheet({ data, onConfirm, onClose }: SizesSheetProps) {
  // The quote as it opened: the page behind takes the new sizes the moment
  // Save is tapped, and the sheet shouldn't change under the tradie's thumb.
  const [opened] = useState(data);
  const [draft, setDraft] = useState<DimensionDraft>(() => dimensionDraft(data.dimension_confirmation));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setTried(true);
    const check = checkSizes(opened, draft);
    if (check.invalid.length > 0 || check.preview?.problem) return;
    setBusy(true);
    setError(null);
    const result = await onConfirm(check.edits, check.preview);
    setBusy(false);
    if ("error" in result) setError(result.error);
  }

  return (
    <SizesSheetView
      data={opened}
      draft={draft}
      tried={tried}
      busy={busy}
      error={error}
      onType={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
      onSave={save}
      onClose={onClose}
    />
  );
}
