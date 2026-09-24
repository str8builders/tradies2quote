"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { sanitizeDecimalInput } from "./lib/number-input";
import { UI_TEXT } from "./styles";

interface FieldChrome {
  /** Always shown above the box (visually hidden with `labelHidden`). */
  label: ReactNode;
  labelHidden?: boolean;
  /** Plain-words help under the box. */
  hint?: ReactNode;
  /** Shown in red under the box; also marks the input invalid. */
  error?: ReactNode;
  /** Inside the box, before the text ("$"). */
  prefix?: ReactNode;
  /** Inside the box, after the text ("m²", "each"). */
  suffix?: ReactNode;
  className?: string;
}

export type TextFieldProps = FieldChrome &
  Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "className" | "size" | "children"> & {
    /** Reaches the <input> (e.g. a sheet's initialFocusRef). */
    ref?: Ref<HTMLInputElement>;
  };

/**
 * A big labelled text box: 17 px label, 56 px box, 20 px text (no iPhone
 * zoom-on-focus), hint and error text wired to the input for screen readers.
 */
export function TextField({
  label,
  labelHidden,
  hint,
  error,
  prefix,
  suffix,
  className,
  id,
  ref,
  inputClassName,
  ...inputProps
}: TextFieldProps & {
  /** Internal: NumberField's tabular figures. Not for restyling. */
  inputClassName?: string;
}) {
  const autoId = useId();
  const inputId = id ?? `field${autoId.replace(/:/g, "")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy =
    [inputProps["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx(UI_TEXT, className)}>
      <label
        htmlFor={inputId}
        className={cx("mb-2 block text-ui-base font-semibold text-ui-text", labelHidden && "sr-only")}
      >
        {label}
      </label>
      <div
        className={cx(
          "ui-focus-within-ring flex min-h-14 items-center gap-2 rounded-ui-md border-2 bg-ui-surface px-4 text-ui-lg text-ui-text",
          error ? "border-ui-bad" : "border-ui-line-strong",
          inputProps.disabled && "bg-ui-surface-2 text-ui-faint",
        )}
      >
        {prefix ? <span className="shrink-0 font-semibold text-ui-muted">{prefix}</span> : null}
        <input
          {...inputProps}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : inputProps["aria-invalid"]}
          aria-describedby={describedBy}
          className={cx("ui-input-reset min-w-0 flex-1 self-stretch py-2", inputClassName)}
        />
        {suffix ? <span className="shrink-0 text-ui-base text-ui-muted">{suffix}</span> : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-2 text-ui-sm text-ui-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-2 flex items-start gap-1.5 text-ui-sm font-semibold text-ui-bad">
          <WarningCircle aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

export type NumberFieldProps = Omit<TextFieldProps, "value" | "onChange" | "type" | "inputMode"> & {
  /** The typed digits as a string ("12.5"), cleaned as the user types. */
  value: string;
  onValueChange: (value: string) => void;
  decimals?: number;
  maxIntegerDigits?: number;
};

/**
 * A TextField for amounts and quantities: number keyboard on phones, only
 * digits and one point accepted, pasted "$1,240.50" cleaned to "1240.50".
 */
export function NumberField({
  value,
  onValueChange,
  decimals = 2,
  maxIntegerDigits = 7,
  ...rest
}: NumberFieldProps) {
  return (
    <TextField
      autoComplete="off"
      {...rest}
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      value={value}
      onChange={(event) =>
        onValueChange(sanitizeDecimalInput(event.target.value, { decimals, maxIntegerDigits }))
      }
      inputClassName="tabular-nums"
    />
  );
}
