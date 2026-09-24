import type { ReactNode } from "react";
import { CheckCircle, Info, Warning, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export type CalloutTone = "info" | "ok" | "warn" | "bad";

const TONE: Record<CalloutTone, { box: string; icon: string; glyph: ReactNode }> = {
  info: { box: "border-ui-info bg-ui-info-soft", icon: "text-ui-info", glyph: <Info weight="bold" /> },
  ok: { box: "border-ui-ok bg-ui-ok-soft", icon: "text-ui-ok", glyph: <CheckCircle weight="bold" /> },
  warn: { box: "border-ui-warn bg-ui-warn-soft", icon: "text-ui-warn", glyph: <Warning weight="bold" /> },
  bad: { box: "border-ui-bad bg-ui-bad-soft", icon: "text-ui-bad", glyph: <WarningOctagon weight="bold" /> },
};

export interface CalloutProps {
  tone?: CalloutTone;
  /** One short sentence: what's going on ("2 items need your price"). */
  title?: ReactNode;
  /** A little more detail, if it helps. */
  children?: ReactNode;
  /** The fix, usually a secondary <Button>. */
  action?: ReactNode;
  /** Replace the tone's icon. */
  icon?: ReactNode;
  className?: string;
}

/** A boxed message that needs attention, with the fix right there. */
export function Callout({ tone = "info", title, children, action, icon, className }: CalloutProps) {
  const t = TONE[tone];
  return (
    <div
      data-tone={tone}
      className={cx("flex gap-3 rounded-ui-lg border-2 p-4 text-ui-base", UI_TEXT, t.box, className)}
    >
      <span aria-hidden="true" className={cx("mt-0.5 inline-flex shrink-0 text-[1.5rem]", t.icon)}>
        {icon ?? t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold text-ui-text">{title}</p> : null}
        {children ? <div className={cx("text-ui-sm text-ui-text", title ? "mt-1" : "")}>{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
