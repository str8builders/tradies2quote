import Link from "next/link";
import type { ReactNode } from "react";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { PRESS, TAP, UI_TEXT } from "./styles";

export interface TopBarProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A "‹ Back" link. Use `leading` instead for a button (e.g. router.back()). */
  back?: { href: string; label?: string };
  /** Anything else on the left, instead of `back`. */
  leading?: ReactNode;
  /** One action on the right. */
  action?: ReactNode;
  /** Pad for the notch. Turn off where the page shell already does. */
  safeArea?: boolean;
  className?: string;
}

/** Screen title with a clear way back. Sticks to the top while the page scrolls. */
export function TopBar({
  title,
  subtitle,
  back,
  leading,
  action,
  safeArea = true,
  className,
}: TopBarProps) {
  return (
    <header
      className={cx(
        "sticky top-0 z-20 border-b border-ui-line bg-ui-bg",
        UI_TEXT,
        safeArea && "pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="flex min-h-16 items-center gap-1 px-2">
        {leading ??
          (back ? (
            <Link
              href={back.href}
              className={cx(
                "ui-focus-ring inline-flex min-h-12 min-w-12 shrink-0 items-center gap-1 rounded-ui-md pr-3 pl-1 text-ui-base font-semibold text-ui-brand-text no-underline hover:bg-ui-surface-2",
                TAP,
                PRESS,
              )}
            >
              <CaretLeft aria-hidden="true" weight="bold" className="text-[1.375rem]" />
              {back.label ?? "Back"}
            </Link>
          ) : null)}
        <div className={cx("min-w-0 flex-1", !leading && !back && "pl-2")}>
          <h1 className="ui-title truncate text-ui-lg text-ui-text">{title}</h1>
          {subtitle ? <p className="truncate text-ui-sm text-ui-muted">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
