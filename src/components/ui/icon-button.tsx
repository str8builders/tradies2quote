import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { PRESS, TAP } from "./styles";

export type IconButtonVariant = "ghost" | "secondary" | "primary";

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: "bg-transparent text-ui-text hover:bg-ui-surface-2",
  secondary: "border border-ui-line bg-ui-surface-2 text-ui-text",
  primary: "bg-ui-brand text-ui-on-brand",
};

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  /** Required: what the button does, read out by screen readers ("Close"). */
  label: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
};

/** A 48 × 48 px icon-only button. The label is its accessible name. */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  className,
  type = "button",
  disabled,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled}
      aria-label={label}
      title={rest.title ?? label}
      className={cx(
        "ui-focus-ring relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-ui-md text-[1.5rem]",
        TAP,
        VARIANT[variant],
        disabled ? "cursor-not-allowed text-ui-faint" : PRESS,
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex">
        {icon}
      </span>
    </button>
  );
}
