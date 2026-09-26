import Link from "next/link";
import type { HTMLAttributes, ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { TAP, UI_TEXT } from "@/components/ui/styles";

export type NoticeTone = "info" | "ok" | "warn" | "bad";

/** The Callout's colours, one meaning each (see src/components/ui/callout.tsx). */
const TONE: Record<NoticeTone, { strip: string; icon: string }> = {
  info: { strip: "border-ui-info bg-ui-info-soft", icon: "text-ui-info" },
  ok: { strip: "border-ui-ok bg-ui-ok-soft", icon: "text-ui-ok" },
  warn: { strip: "border-ui-warn bg-ui-warn-soft", icon: "text-ui-warn" },
  bad: { strip: "border-ui-bad bg-ui-bad-soft", icon: "text-ui-bad" },
};

const STRIP = "block w-full border-b-2";
/** Lined up with the screens' own column; the end control drops under the words on a narrow phone. */
const ROW = "mx-auto flex min-h-12 w-full max-w-xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2";

function Glyph({ tone, icon }: { tone: NoticeTone; icon: ReactNode }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex shrink-0 text-[1.375rem]", TONE[tone].icon)}>
      {icon}
    </span>
  );
}

export type NoticeStripProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  tone?: NoticeTone;
  /** A Phosphor icon (weight="bold"), in the tone's colour. */
  icon: ReactNode;
  /** One or two short sentences. */
  children: ReactNode;
  /** A control at the end: a link, a dismiss button. */
  end?: ReactNode;
};

/**
 * A slim notice across the top of a new-look screen (the trial and beta
 * reminders the shell shows above every page): a Callout's colours in one
 * row, 15 px words, and room for a 48 px control at the end.
 */
export function NoticeStrip({ tone = "info", icon, children, end, className, ...rest }: NoticeStripProps) {
  return (
    <div {...rest} data-tone={tone} className={cx(STRIP, UI_TEXT, TONE[tone].strip, className)}>
      <div className={ROW}>
        <Glyph tone={tone} icon={icon} />
        <p className="min-w-0 flex-[1_1_12rem] text-ui-sm text-ui-text">{children}</p>
        {end ? <div className="ml-auto flex shrink-0 items-center gap-1">{end}</div> : null}
      </div>
    </div>
  );
}

export interface NoticeLinkProps {
  href: string;
  tone?: NoticeTone;
  icon: ReactNode;
  /** What's going on, in a sentence. */
  children: ReactNode;
  /** Where the tap goes, in a few words ("Subscribe"). */
  action: ReactNode;
  "data-testid"?: string;
  className?: string;
}

/** The same strip as one link: the whole strip is the tap target, the destination named at the end. */
export function NoticeLink({ href, tone = "info", icon, children, action, className, ...rest }: NoticeLinkProps) {
  return (
    <Link
      href={href}
      {...rest}
      data-tone={tone}
      className={cx("group ui-focus-ring no-underline", STRIP, TAP, UI_TEXT, TONE[tone].strip, className)}
    >
      <span className={ROW}>
        <Glyph tone={tone} icon={icon} />
        <span className="min-w-0 flex-[1_1_12rem] text-ui-sm text-ui-text">{children}</span>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-ui-sm font-semibold text-ui-text group-hover:underline">
          {action}
          <CaretRight aria-hidden="true" weight="bold" />
        </span>
      </span>
    </Link>
  );
}
