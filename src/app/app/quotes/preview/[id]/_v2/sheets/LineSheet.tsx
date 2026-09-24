"use client";

import { useMemo, useRef, useState } from "react";
import { Trash } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { currencySymbol } from "@/components/ui/lib/number-input";
import { Money } from "@/components/ui/money";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { NumberField, TextField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { round2 } from "@/lib/quote-defaults";
import type { QuoteItemType, QuoteLineItem } from "@/lib/quote-types";
import { blockedLineGuide } from "@/lib/takeoff/blockedLineGuide";
import {
  applyLineForm,
  blankLine,
  blankLineForm,
  hasUnconfirmedQuantity,
  lineForm,
  lineFormProblem,
  linesEqual,
  newLineFromForm,
  unitChangeClearsPrice,
  type LineForm,
} from "../lines";
import { priceUnitLabel } from "../price-steps";

const TYPES = [
  { value: "material", label: "Material" },
  { value: "labour", label: "Labour" },
  { value: "other", label: "Other" },
] as const;

function typedNumber(value: string): number | null {
  if (!/\d/.test(value)) return null;
  const n = Number(value.endsWith(".") ? value.slice(0, -1) : value);
  return Number.isFinite(n) ? n : null;
}

export type LineSheetMode = { kind: "edit"; index: number; line: QuoteLineItem } | { kind: "new" };

export interface LineSheetProps {
  mode: LineSheetMode;
  currency: string;
  onSave: (line: QuoteLineItem) => Promise<{ ok: true } | { error: string }>;
  onDelete?: () => Promise<{ ok: true } | { error: string }>;
  onClose: () => void;
}

/**
 * Change one line (what it is, how many, the unit, the price) or delete it,
 * or add a new one. Saving goes through the classic edit rules and the
 * classic save action, so totals, versions and library learning match.
 */
export function LineSheet({ mode, currency, onSave, onDelete, onClose }: LineSheetProps) {
  const original = mode.kind === "edit" ? mode.line : null;
  const [type, setType] = useState<QuoteItemType>(original?.type ?? "material");
  const opened = useMemo(() => (original ? lineForm(original) : blankLineForm(type)), [original, type]);
  const [form, setForm] = useState<LineForm>(opened);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<LineForm>) => setForm((f) => ({ ...f, ...patch }));
  const problem = lineFormProblem(form);
  const quantity = typedNumber(form.quantity) ?? 0;
  const price = form.price.trim() === "" ? 0 : (typedNumber(form.price) ?? 0);
  const clearsPrice = original ? unitChangeClearsPrice(original, form, opened) : false;
  const lineTotal = round2(quantity * (clearsPrice ? 0 : price));

  function changeType(next: QuoteItemType) {
    // A new line: follow the default unit while the tradie hasn't typed one.
    setForm((f) => (f.unit === blankLine(type).unit ? { ...f, unit: blankLine(next).unit } : f));
    setType(next);
  }

  async function save() {
    setTried(true);
    if (problem) return;
    const next = original ? applyLineForm(original, form, opened) : newLineFromForm(type, form);
    if (original && linesEqual(next, original)) {
      onClose();
      return;
    }
    setBusy("save");
    setError(null);
    const result = await onSave(next);
    setBusy(null);
    if ("error" in result) setError(result.error);
  }

  async function remove() {
    if (!onDelete) return;
    setBusy("delete");
    setError(null);
    const result = await onDelete();
    setBusy(null);
    if ("error" in result) setError(result.error);
  }

  const aiQuantity = original ? hasUnconfirmedQuantity(original) : false;
  const blocked = original?.takeoff_status === "blocked";
  const flagged = original?.takeoff_status === "needs_review" || original?.takeoff_status === "assumed";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={original ? "Change this line" : "Add a line"}
      initialFocusRef={original ? undefined : descriptionRef}
      footer={
        <Button fullWidth data-testid="job-line-save" loading={busy === "save"} loadingLabel="Saving…" disabled={busy !== null} onClick={save}>
          {original ? "Save" : "Add the line"}
        </Button>
      }
    >
      <div className="space-y-5">
        {blocked ? (
          <Callout tone="warn" title="This line needs a size">
            {blockedLineGuide(original?.description)}
          </Callout>
        ) : null}
        {flagged && original?.takeoff_flags?.length ? (
          <Callout tone="warn" title="This was worked out with some guesses">
            <ul className="list-disc space-y-1 pl-5">
              {original.takeoff_flags.map((flag, i) => (
                <li key={`${i}-${flag}`}>{flag}</li>
              ))}
            </ul>
          </Callout>
        ) : null}
        {!original ? (
          <SegmentedControl label="What kind of line?" options={TYPES} value={type} onChange={changeType} />
        ) : null}
        <TextField
          ref={descriptionRef}
          label="What is it?"
          value={form.description}
          onChange={(event) => set({ description: event.target.value })}
          error={tried && problem === "description" ? "Say what this line is." : undefined}
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="How many?"
            value={form.quantity}
            onValueChange={(value) => set({ quantity: value })}
            decimals={3}
            error={tried && problem === "quantity" ? "Add a number." : undefined}
          />
          <TextField
            label="Unit"
            value={form.unit}
            onChange={(event) => set({ unit: event.target.value })}
            hint="each, m, m², hour"
            autoComplete="off"
          />
        </div>
        {aiQuantity ? (
          <Toggle
            checked={form.quantityChecked}
            onChange={(value) => set({ quantityChecked: value })}
            label="The quantity is right"
            description="We estimated it. Check it before the quote goes."
          />
        ) : null}
        <NumberField
          label={priceUnitLabel(form.unit)}
          value={form.price}
          onValueChange={(value) => set({ price: value })}
          prefix={currencySymbol(currency)}
          hint={clearsPrice ? "Changing the unit clears the old price. Add the price for the new unit." : undefined}
          error={tried && problem === "price" ? "Add a price, or leave it empty." : undefined}
        />
        <p className="flex items-baseline justify-between gap-3 text-ui-base">
          <span className="text-ui-muted">Line total</span>
          <Money amount={lineTotal} currency={currency} className="font-semibold" />
        </p>
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
        {original && onDelete ? (
          confirmDelete ? (
            <Callout
              tone="bad"
              title="Delete this line?"
              action={
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="danger" fullWidth loading={busy === "delete"} loadingLabel="Deleting…" disabled={busy !== null} onClick={remove}>
                    Yes, delete it
                  </Button>
                  <Button variant="secondary" fullWidth disabled={busy !== null} onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                </div>
              }
            >
              It comes off the quote and the total goes down.
            </Callout>
          ) : (
            <Button variant="ghost" fullWidth icon={<Trash weight="bold" />} onClick={() => setConfirmDelete(true)}>
              Delete this line
            </Button>
          )
        ) : null}
      </div>
    </BottomSheet>
  );
}
