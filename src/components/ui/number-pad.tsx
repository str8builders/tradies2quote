"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Backspace } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import {
  applyPadKey,
  padKeyFromKeyboard,
  type NumberRules,
  type PadKey,
} from "./lib/number-input";
import { PRESS, TAP, UI_TEXT } from "./styles";

export interface NumberPadProps {
  /** The typed digits, e.g. "3.85". Keep it as a string while typing. */
  value: string;
  onChange: (value: string) => void;
  /** Digits after the point; 0 hides the point key. Default 2. */
  decimals?: number;
  /** Digits before the point. Default 7. */
  maxIntegerDigits?: number;
  /** Accessible name of the keypad group. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

const KEYS: Array<{ key: PadKey; label: ReactNode; name?: string }> = [
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  { key: ".", label: ".", name: "Decimal point" },
  { key: "0", label: "0" },
  { key: "backspace", label: <Backspace weight="bold" />, name: "Delete last digit" },
];

/**
 * A big on-screen keypad for prices and quantities — easier with gloves than
 * the phone keyboard, and it can't type letters. Keys are 64 px tall. Works
 * with a physical keyboard too when it has focus.
 */
export function NumberPad({
  value,
  onChange,
  decimals = 2,
  maxIntegerDigits = 7,
  label = "Number pad",
  disabled = false,
  className,
}: NumberPadProps) {
  const rules: NumberRules = { decimals, maxIntegerDigits };
  const press = (key: PadKey) => {
    if (disabled) return;
    const next = applyPadKey(value, key, rules);
    if (next !== value) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = padKeyFromKeyboard(event.key);
    if (!key) return;
    event.preventDefault();
    press(key);
  };

  return (
    <div
      role="group"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx("grid grid-cols-3 gap-2", UI_TEXT, className)}
    >
      {KEYS.map(({ key, label: keyLabel, name }) => {
        const hidden = key === "." && decimals <= 0;
        if (hidden) return <span key={key} aria-hidden="true" />;
        return (
          <button
            key={key}
            type="button"
            data-key={key}
            aria-label={name}
            disabled={disabled}
            onClick={() => press(key)}
            className={cx(
              "ui-focus-ring flex min-h-16 items-center justify-center rounded-ui-md border border-ui-line bg-ui-surface-2 text-ui-2xl font-semibold tabular-nums text-ui-text",
              TAP,
              disabled ? "cursor-not-allowed text-ui-faint" : cx(PRESS, "active:bg-ui-bg"),
            )}
          >
            {keyLabel}
          </button>
        );
      })}
    </div>
  );
}
