"use client";

import {
  useId,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { CaretDown, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { UI_TEXT } from "@/components/ui/styles";
import type { Choice } from "./model";

/**
 * A pick-one list and a multi-line box that match the kit's <TextField>:
 * 17 px label above, 56 px box, 20 px text, hint and error wired up for
 * screen readers. The kit has neither yet, so they live with the pages that
 * need them. `ui-input-reset` keeps the /app shell's older input rules off.
 */

interface FieldChrome {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
}

function useFieldIds(id: string | undefined, hint: ReactNode, error: ReactNode) {
  const autoId = useId();
  const fieldId = id ?? `field${autoId.replace(/:/g, "")}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  return { fieldId, hintId, errorId, describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-2 block text-ui-base font-semibold text-ui-text">
      {children}
    </label>
  );
}

function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
      <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
      <span>{children}</span>
    </p>
  );
}

export type SelectFieldProps = FieldChrome &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
    options: readonly Choice[];
  };

export function SelectField({ label, hint, error, className, id, options, ...selectProps }: SelectFieldProps) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx(UI_TEXT, className)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div
        className={cx(
          "ui-focus-within-ring relative flex min-h-14 items-center rounded-ui-md border-2 bg-ui-surface text-ui-lg text-ui-text",
          error ? "border-ui-bad" : "border-ui-line-strong",
        )}
      >
        <select
          {...selectProps}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="ui-input-reset min-h-14 w-full min-w-0 cursor-pointer py-2 pr-12 pl-4"
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
          className="pointer-events-none absolute right-4 text-[1.25rem] text-ui-muted"
        />
      </div>
      {hint ? (
        <p id={hintId} className="mt-2 text-ui-sm text-ui-muted">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

export type TextAreaFieldProps = FieldChrome &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "children" | "value"> & {
    value: string;
  };

/** With `maxLength`, a plain "120 of 500" count sits beside the hint. */
export function TextAreaField({ label, hint, error, className, id, value, maxLength, ...areaProps }: TextAreaFieldProps) {
  const { fieldId, hintId, errorId, describedBy } = useFieldIds(id, hint, error);
  return (
    <div className={cx(UI_TEXT, className)}>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <div
        className={cx(
          "ui-focus-within-ring rounded-ui-md border-2 bg-ui-surface px-4 py-3 text-ui-lg text-ui-text",
          error ? "border-ui-bad" : "border-ui-line-strong",
        )}
      >
        <textarea
          {...areaProps}
          id={fieldId}
          value={value}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="ui-input-reset block min-h-32 w-full resize-y"
        />
      </div>
      {hint || maxLength ? (
        <div className="mt-2 flex items-start justify-between gap-3 text-ui-sm text-ui-muted">
          {hint ? <p id={hintId}>{hint}</p> : <span />}
          {maxLength ? (
            <span aria-hidden="true" className="shrink-0 tabular-nums">
              {value.length} of {maxLength}
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
