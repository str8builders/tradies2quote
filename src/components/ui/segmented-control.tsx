"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { nextSegmentIndex } from "./lib/segments";
import { TAP, UI_TEXT } from "./styles";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  /** What is being chosen ("Show"). */
  label: ReactNode;
  labelHidden?: boolean;
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * Pick one of two to four options side by side. A radio group underneath:
 * one tab stop, arrow keys move the choice. (Not role="tab" — older app CSS
 * restyles tabs inside the /app shell.)
 */
export function SegmentedControl<T extends string>({
  label,
  labelHidden,
  options,
  value,
  onChange,
  className,
}: SegmentedControlProps<T>) {
  const labelId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const found = options.findIndex((option) => option.value === value);
  const selectedIndex = found === -1 ? 0 : found;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextSegmentIndex(index, event.key, options.length);
    if (next === null) return;
    event.preventDefault();
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className={cx(UI_TEXT, className)}>
      <p id={labelId} className={cx("mb-2 text-ui-base font-semibold", labelHidden && "sr-only")}>
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="grid auto-cols-fr grid-flow-col gap-1 rounded-ui-md border border-ui-line bg-ui-surface-2 p-1"
      >
        {options.map((option, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={option.value}
              ref={(element) => {
                buttons.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cx(
                "ui-focus-ring min-h-12 rounded-ui-sm px-3 py-2 text-ui-base font-semibold",
                TAP,
                selected
                  ? "bg-ui-bg text-ui-text shadow-ui-card ring-2 ring-ui-line-strong"
                  : "text-ui-muted hover:text-ui-text",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
