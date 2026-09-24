import type { ReactNode } from "react";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export interface BottomActionBarProps {
  /** Usually one full-width primary <Button>: the next step, at the thumb. */
  children: ReactNode;
  /** A line of plain words above the button ("Next: send the invoice"). */
  hint?: ReactNode;
  /** Pad for the home indicator. Turn off where the page shell already does. */
  safeArea?: boolean;
  className?: string;
}

/**
 * Sticks to the bottom of the screen while the page scrolls, clear of the
 * iPhone home indicator. Place it last inside a <Screen>.
 */
export function BottomActionBar({ children, hint, safeArea = true, className }: BottomActionBarProps) {
  return (
    <div
      className={cx(
        "sticky bottom-0 z-20 mt-auto border-t border-ui-line bg-ui-bg px-4 pt-3",
        UI_TEXT,
        safeArea ? "pb-[max(env(safe-area-inset-bottom),0.75rem)]" : "pb-3",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        {hint ? <p className="text-center text-ui-sm text-ui-muted">{hint}</p> : null}
        {children}
      </div>
    </div>
  );
}
