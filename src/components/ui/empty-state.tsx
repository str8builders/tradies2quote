import type { ReactNode } from "react";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export interface EmptyStateProps {
  /** A Phosphor icon element, shown large in a soft circle. */
  icon?: ReactNode;
  title: ReactNode;
  /** One or two plain sentences: why it's empty and what to do. */
  children?: ReactNode;
  /** The next step, usually one primary <Button>. */
  action?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}

/** What a screen shows when there's nothing yet — always with a way forward. */
export function EmptyState({ icon, title, children, action, as: Heading = "h2", className }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-10 text-center text-ui-base", UI_TEXT, className)}>
      {icon ? (
        <span
          aria-hidden="true"
          className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-ui-brand-soft text-[2rem] text-ui-brand-text"
        >
          {icon}
        </span>
      ) : null}
      <Heading className="ui-title text-ui-lg text-ui-text">{title}</Heading>
      {children ? <div className="mt-2 max-w-sm text-ui-muted">{children}</div> : null}
      {action ? <div className="mt-6 flex w-full max-w-xs flex-col gap-2">{action}</div> : null}
    </div>
  );
}
