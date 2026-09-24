"use client";

import { useState, type ReactNode } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Money } from "@/components/ui/money";
import { TextField } from "@/components/ui/text-field";
import { formatShortDayDate } from "@/lib/format-date";
import { todayKey } from "../dates";

export type StepResult = { ok: true } | { error: string };

/**
 * One step that can't be undone (they said yes, start, done, paid…),
 * confirmed in a sheet rather than a browser confirm(). The error, if the
 * server says no, stays in the sheet with the button to try again.
 */
export function ConfirmSheet({
  title,
  description,
  children,
  confirmLabel,
  busyLabel = "Saving…",
  variant = "primary",
  permanent = true,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  busyLabel?: string;
  variant?: ButtonVariant;
  /** Say plainly that it can't be undone. */
  permanent?: boolean;
  onConfirm: () => Promise<StepResult>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function runConfirm() {
    setBusy(true);
    setError(null);
    const result = await onConfirm();
    setBusy(false);
    if ("error" in result) setError(result.error);
  }
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <Button
          fullWidth
          size="lg"
          variant={variant}
          data-testid="job-step-confirm"
          loading={busy}
          loadingLabel={busyLabel}
          onClick={runConfirm}
        >
          {confirmLabel}
        </Button>
      }
    >
      <div className="space-y-4">
        {children}
        {permanent ? <p className="text-ui-sm text-ui-muted">This can&apos;t be undone.</p> : null}
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/** Pick the day and book the job (the classic scheduleJob action writes it). */
export function BookSheet({
  onBook,
  onClose,
}: {
  onBook: (day: string) => Promise<StepResult>;
  onClose: () => void;
}) {
  const [day, setDay] = useState(() => todayKey(1));
  const [min] = useState(() => todayKey(0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= min;
  async function book() {
    if (!valid) return;
    setBusy(true);
    setError(null);
    const result = await onBook(day);
    setBusy(false);
    if ("error" in result) setError(result.error);
  }
  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Book the job"
      description="Pick the day you'll start. It goes on your calendar."
      footer={
        <Button fullWidth data-testid="job-book-confirm" disabled={!valid} loading={busy} loadingLabel="Booking…" onClick={book}>
          {valid ? `Book it for ${formatShortDayDate(day)}` : "Book it"}
        </Button>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Start day"
          type="date"
          value={day}
          min={min}
          onChange={(event) => setDay(event.target.value)}
          error={day && !valid ? "Pick today or a day after." : undefined}
        />
        {error ? (
          <div role="alert">
            <Callout tone="bad" title={error} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/** A money line inside a confirm sheet ("$4,830.00 to sam@example.com"). */
export function AmountLine({ amount, currency, children }: { amount: number; currency: string; children?: ReactNode }) {
  return (
    <p className="text-ui-lg">
      <Money amount={amount} currency={currency} className="font-semibold" />
      {children ? <span className="text-ui-muted"> {children}</span> : null}
    </p>
  );
}
