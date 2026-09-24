import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export type CardPadding = "none" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  md: "p-4",
  lg: "p-5 sm:p-6",
};

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "article" | "li";
  /** "none" for cards that hold full-width list rows. */
  padding?: CardPadding;
  children?: ReactNode;
};

/** The one card style: surface, hairline edge, large radius, soft shadow. */
export function Card({ as: Tag = "div", padding = "md", className, children, ...rest }: CardProps) {
  return (
    <Tag
      {...rest}
      className={cx(
        "rounded-ui-lg border border-ui-line bg-ui-surface text-ui-base shadow-ui-card",
        UI_TEXT,
        PADDING[padding],
        className,
      )}
    >
      {children}
    </Tag>
  );
}
