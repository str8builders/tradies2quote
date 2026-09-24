import type { ReactNode } from "react";
import { cx } from "./cx";
import type { Tone } from "./styles";

const TONE: Record<Tone, string> = {
  ok: "bg-ui-ok-soft text-ui-ok",
  warn: "bg-ui-warn-soft text-ui-warn",
  bad: "bg-ui-bad-soft text-ui-bad",
  info: "bg-ui-info-soft text-ui-info",
  neutral: "bg-ui-surface-2 text-ui-muted",
};

export interface StatusPillProps {
  tone?: Tone;
  /** Optional small icon before the words. The words carry the meaning. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A short status in plain words ("Needs price", "Paid"). Not a button. */
export function StatusPill({ tone = "neutral", icon, children, className }: StatusPillProps) {
  return (
    <span
      data-tone={tone}
      className={cx(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 font-ui-sans text-ui-sm font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="inline-flex text-[1.1em]">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
