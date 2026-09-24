import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { SpinnerGap } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { PRESS, TAP } from "./styles";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
/** Three sizes: lg 56 px (the main action), md 48 px, sm 40 px with a 48 px tap area. */
export type ButtonSize = "lg" | "md" | "sm";

/** The primary button is the big one unless asked otherwise. */
const DEFAULT_SIZE: Record<ButtonVariant, ButtonSize> = {
  primary: "lg",
  secondary: "md",
  ghost: "md",
  danger: "md",
};

const SIZE: Record<ButtonSize, string> = {
  lg: "min-h-14 rounded-ui-lg px-6 py-2 text-ui-lg",
  md: "min-h-12 rounded-ui-md px-5 py-2 text-ui-base",
  sm: "min-h-10 rounded-ui-md px-4 py-1.5 text-ui-sm after:absolute after:-inset-1 after:content-['']",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ui-brand text-ui-on-brand shadow-ui-raised",
  secondary: "border border-ui-line bg-ui-surface-2 text-ui-text hover:border-ui-line-strong",
  ghost: "bg-transparent text-ui-brand-text hover:bg-ui-surface-2",
  danger: "border-2 border-ui-bad bg-ui-bad-soft text-ui-bad",
};

const DISABLED = "cursor-not-allowed border border-ui-line bg-ui-surface-2 text-ui-faint";

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

/** The class list for a kit button, for the rare element that must look like one. */
export function buttonClasses({
  variant = "primary",
  size,
  fullWidth = false,
  disabled = false,
  loading = false,
}: ButtonStyleOptions = {}): string {
  const resolvedSize = size ?? DEFAULT_SIZE[variant];
  return cx(
    "ui-focus-ring relative inline-flex items-center justify-center gap-2 text-center font-ui-sans font-semibold tracking-normal no-underline",
    TAP,
    SIZE[resolvedSize],
    disabled && !loading ? DISABLED : VARIANT[variant],
    !disabled && !loading && PRESS,
    loading && "cursor-progress",
    fullWidth && "w-full",
  );
}

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Shows a spinner, keeps the label, and blocks further taps. */
  loading?: boolean;
  /** Label while loading ("Saving…"); defaults to the normal label. */
  loadingLabel?: ReactNode;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  className?: string;
  children: ReactNode;
}

function Inner({
  icon,
  iconEnd,
  loading,
  loadingLabel,
  children,
}: Pick<ButtonOwnProps, "icon" | "iconEnd" | "loading" | "loadingLabel" | "children">) {
  return (
    <>
      {loading ? (
        <SpinnerGap
          aria-hidden="true"
          weight="bold"
          className="shrink-0 animate-spin text-[1.15em] motion-reduce:animate-none"
        />
      ) : icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 text-[1.15em]">
          {icon}
        </span>
      ) : null}
      <span>{loading && loadingLabel ? loadingLabel : children}</span>
      {iconEnd && !loading ? (
        <span aria-hidden="true" className="inline-flex shrink-0 text-[1.15em]">
          {iconEnd}
        </span>
      ) : null}
    </>
  );
}

export type ButtonProps = ButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonOwnProps>;

/**
 * The kit button. Primary is the one big orange button per screen (56 px);
 * secondary, ghost and danger are 48 px. `type` defaults to "button" so a
 * button inside a form never submits by accident.
 */
export function Button({
  variant = "primary",
  size,
  fullWidth,
  loading = false,
  loadingLabel,
  icon,
  iconEnd,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-variant={variant}
      className={cx(buttonClasses({ variant, size, fullWidth, disabled, loading }), className)}
    >
      <Inner icon={icon} iconEnd={iconEnd} loading={loading} loadingLabel={loadingLabel}>
        {children}
      </Inner>
    </button>
  );
}

export type ButtonLinkProps = Omit<ButtonOwnProps, "loading" | "loadingLabel"> &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonOwnProps | "href"> & {
    href: string;
  };

/** A link that looks like a kit button (navigation, not an action). */
export function ButtonLink({
  variant = "primary",
  size,
  fullWidth,
  icon,
  iconEnd,
  className,
  children,
  href,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link
      href={href}
      {...rest}
      data-variant={variant}
      className={cx(buttonClasses({ variant, size, fullWidth }), className)}
    >
      <Inner icon={icon} iconEnd={iconEnd}>
        {children}
      </Inner>
    </Link>
  );
}
