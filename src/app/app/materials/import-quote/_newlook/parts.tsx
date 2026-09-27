"use client";

import { useId, type ReactNode } from "react";
import { Callout } from "@/components/ui/callout";
import { cx } from "@/components/ui/cx";
import type { QuoteImport } from "../_components/QuoteImportClient";

/** The scan's state and handlers as the new look draws them: all but the file inputs' refs. */
export type ScanState = Omit<QuoteImport, "fileRef" | "libraryRef">;

/**
 * A tick box in a 48 px row; the label is the tap target. The scan's ticks
 * stay real checkboxes (the old look's roles and names), and the GST note
 * tells the tradie to "tick" one.
 */
export function CheckRow({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  testId,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  testId?: string;
  className?: string;
}) {
  const descriptionId = `check${useId().replace(/:/g, "")}`;
  return (
    <div className={className}>
      <label
        className={cx(
          "flex min-h-12 items-center gap-3 font-semibold",
          disabled ? "cursor-not-allowed text-ui-faint" : "cursor-pointer text-ui-text",
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={description ? descriptionId : undefined}
          data-testid={testId}
          className="ui-focus-ring h-6 w-6 shrink-0 cursor-pointer accent-ui-brand disabled:cursor-not-allowed"
        />
        <span className="min-w-0 flex-1">{label}</span>
      </label>
      {description ? (
        <p id={descriptionId} className="pl-9 text-ui-sm text-ui-muted">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** What went wrong, read out as soon as it shows. */
export function ScanError({ error }: { error: string }) {
  return (
    <div role="alert">
      <Callout tone="bad" title={<span data-testid="quote-import-error">{error}</span>} />
    </div>
  );
}
