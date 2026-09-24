"use client";

import { useId, type ReactNode } from "react";
import { cx } from "./cx";
import { TAP, UI_TEXT } from "./styles";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What the switch controls, in plain words. Tapping it also flips the switch. */
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Submit with a form as "on"/"off" under this name. */
  name?: string;
  /** Print "On"/"Off" beside the switch (default) so the state is never colour-only. */
  showState?: boolean;
  onLabel?: string;
  offLabel?: string;
  className?: string;
}

/**
 * An on/off switch (role="switch") in a 48 px row. The whole label is a tap
 * target, and the state is spelled out as well as shown.
 */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id,
  name,
  showState = true,
  onLabel = "On",
  offLabel = "Off",
  className,
}: ToggleProps) {
  const autoId = useId();
  const switchId = id ?? `toggle${autoId.replace(/:/g, "")}`;
  const labelId = `${switchId}-label`;
  const descriptionId = description ? `${switchId}-description` : undefined;

  return (
    <div className={cx("flex min-h-12 items-center justify-between gap-4", UI_TEXT, className)}>
      <div className="min-w-0 flex-1">
        <label
          id={labelId}
          htmlFor={switchId}
          className={cx("block text-ui-base font-semibold", disabled ? "text-ui-faint" : "cursor-pointer")}
        >
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-ui-sm text-ui-muted">
            {description}
          </p>
        ) : null}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "ui-focus-ring inline-flex min-h-12 shrink-0 items-center gap-3 rounded-ui-md px-1",
          TAP,
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {showState ? (
          <span
            aria-hidden="true"
            className={cx("min-w-[2ch] text-right text-ui-sm font-semibold", checked ? "text-ui-text" : "text-ui-muted")}
          >
            {checked ? onLabel : offLabel}
          </span>
        ) : null}
        <span
          aria-hidden="true"
          className={cx(
            "relative inline-flex h-8 w-14 items-center rounded-full border-2",
            checked ? "border-ui-brand bg-ui-brand" : "border-ui-line-strong bg-ui-surface-2",
          )}
        >
          <span
            data-thumb=""
            className={cx(
              "absolute left-0.5 h-6 w-6 rounded-full transition-transform duration-ui-fast ease-ui-out motion-reduce:transition-none",
              checked ? "translate-x-6 bg-ui-on-brand" : "translate-x-0 bg-ui-muted",
            )}
          />
        </span>
      </button>
      {name ? <input type="hidden" name={name} value={checked ? "on" : "off"} /> : null}
    </div>
  );
}
