import Link from "next/link";
import type { ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react/dist/ssr";
import { cx } from "./cx";
import { IconTile } from "./icon-tile";
import { TAP, UI_TEXT, type IconTone } from "./styles";

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** A Phosphor icon element (duotone), shown in a 40 px <IconTile>. */
  icon?: ReactNode;
  iconTone?: IconTone;
  /** Right-hand value: <Money/>, a <StatusPill/>, or short text. */
  trailing?: ReactNode;
  /** Show the ›. Defaults to on when the row is tappable. */
  chevron?: boolean;
  /** Tappable as a link… */
  href?: string;
  /** …or as a button. Without either, the row is plain content. */
  onClick?: () => void;
  className?: string;
}

/**
 * One line in a list: icon, title, subtitle, and a value on the right.
 * Tappable rows are at least 64 px tall. Put rows in a <ul> inside a
 * `<Card padding="none">`, with `divide-y divide-ui-line` on the list.
 */
export function ListRow({
  title,
  subtitle,
  icon,
  iconTone = "neutral",
  trailing,
  chevron,
  href,
  onClick,
  className,
}: ListRowProps) {
  const interactive = Boolean(href || onClick);
  const showChevron = chevron ?? interactive;
  const classes = cx(
    "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left text-ui-base no-underline",
    UI_TEXT,
    interactive && cx("ui-focus-ring cursor-pointer hover:bg-ui-surface-2 active:bg-ui-surface-2", TAP),
    className,
  );
  const content = (
    <>
      {icon ? <IconTile icon={icon} tone={iconTone} /> : null}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold break-words text-ui-text">{title}</span>
        {subtitle ? <span className="block text-ui-sm text-ui-muted">{subtitle}</span> : null}
      </span>
      {trailing ? (
        <span className="shrink-0 text-right font-semibold text-ui-text">{trailing}</span>
      ) : null}
      {showChevron ? (
        <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
