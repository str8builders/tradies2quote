"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import { currencySymbol } from "@/components/ui/lib/number-input";
import { Money } from "@/components/ui/money";
import { NumberPad } from "@/components/ui/number-pad";
import { Toggle } from "@/components/ui/toggle";
import type { QuoteLineItem } from "@/lib/quote-types";
import { quantityText } from "../lines";
import {
  advancePriceSession,
  canRemember,
  currentPriceStep,
  previewLineTotal,
  priceQuestion,
  priceSessionDone,
  priceUnitLabel,
  startPriceSession,
  typedPrice,
  type PriceSession,
} from "../price-steps";

export interface PriceSheetProps {
  lines: readonly QuoteLineItem[];
  /** Start at this line (the tradie tapped it), then the rest. */
  startAt?: number;
  currency: string;
  /** Saves one price through saveQuoteChanges; learn=false skips the library. */
  onSavePrice: (index: number, price: number, learn: boolean) => Promise<{ ok: true } | { error: string }>;
  onDone: (session: PriceSession) => void;
  onClose: () => void;
}

/**
 * The price keypad: one unpriced line at a time, a big keypad, the line
 * total as you type, and "Remember for next time" (on: the price also goes
 * into the tradie's material library, exactly like a classic save; off:
 * this save skips the library).
 */
export function PriceSheet({ lines, startAt, currency, onSavePrice, onDone, onClose }: PriceSheetProps) {
  const [session, setSession] = useState<PriceSession>(() => startPriceSession(lines, startAt));
  const [typed, setTyped] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = currentPriceStep(session);
  const line = step ? lines[step.index] : undefined;

  function moveOn(next: PriceSession) {
    setError(null);
    if (priceSessionDone(next)) {
      onDone(next);
      return;
    }
    setSession(next);
    setTyped("");
  }

  async function saveAndNext() {
    const price = typedPrice(typed);
    if (!step || !line || price === null || busy) return;
    const learn = canRemember(line) ? remember : true;
    setBusy(true);
    const result = await onSavePrice(step.index, price, learn);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    moveOn(advancePriceSession(session, "saved", canRemember(line) && remember));
  }

  if (!step || !line) {
    return (
      <BottomSheet open onClose={onClose} title="Every line has a price">
        <p className="text-ui-muted">Nothing left to price on this job.</p>
      </BottomSheet>
    );
  }

  const total = previewLineTotal(line.quantity, typed);
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={priceQuestion(line)}
      description={`${step.number} of ${step.count}`}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="ghost" size="lg" disabled={busy} onClick={() => moveOn(advancePriceSession(session, "skipped"))}>
            Skip
          </Button>
          <Button
            fullWidth
            data-testid="job-price-save"
            disabled={typedPrice(typed) === null}
            loading={busy}
            loadingLabel="Saving…"
            onClick={saveAndNext}
          >
            {step.last ? "Save and finish" : "Save and next"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4" data-testid="job-price-step" data-line-index={step.index}>
        <div>
          <p className="font-semibold break-words">{line.description?.trim() || "Untitled line"}</p>
          <p className="text-ui-sm text-ui-muted">
            {quantityText(line)} on this job · {priceUnitLabel(line.unit)}
          </p>
        </div>
        <div
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-ui-md border-2 border-ui-brand bg-ui-bg px-4 py-2"
        >
          <span className={cx("text-ui-display font-bold tabular-nums", typed ? "text-ui-text" : "text-ui-faint")}>
            {currencySymbol(currency)}
            {typed || "0.00"}
          </span>
          <span className="ml-auto text-ui-sm text-ui-muted">
            × {quantityText(line)} = {total === null ? "…" : <Money amount={total} currency={currency} />}
          </span>
        </div>
        <NumberPad value={typed} onChange={setTyped} label={`Price for ${line.description || "this line"}`} disabled={busy} />
        {canRemember(line) ? (
          <Toggle
            checked={remember}
            onChange={setRemember}
            label="Remember for next time"
            description="Adds this price to your materials list."
          />
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
