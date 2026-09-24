import type { ReactNode } from "react";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export interface SectionTitleProps {
  children: ReactNode;
  /** Heading level. Defaults to h1 for a page title, h2 for a section. */
  as?: "h1" | "h2" | "h3";
  /** "page": big Archivo Black heading. "section": 20 px sans title. */
  size?: "page" | "section";
  /** A line of plain words under the title. */
  description?: ReactNode;
  /** A small action on the right ("See all"). */
  action?: ReactNode;
  id?: string;
  className?: string;
}

/** Sentence case, plain words — no codes, no "// label" eyebrows. */
export function SectionTitle({
  children,
  as,
  size = "section",
  description,
  action,
  id,
  className,
}: SectionTitleProps) {
  const Tag = as ?? (size === "page" ? "h1" : "h2");
  return (
    <div className={cx("flex items-end justify-between gap-3", UI_TEXT, className)}>
      <div className="min-w-0">
        <Tag
          id={id}
          className={cx(
            "text-ui-text",
            size === "page" ? "ui-heading text-ui-2xl" : "ui-title text-ui-lg",
          )}
        >
          {children}
        </Tag>
        {description ? (
          <p className={cx("mt-1 text-ui-muted", size === "page" ? "text-ui-base" : "text-ui-sm")}>
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
