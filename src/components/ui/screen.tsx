import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";
import { UI_TEXT } from "./styles";

export type ScreenProps = HTMLAttributes<HTMLDivElement> & {
  /** "viewport": at least the phone's height. "fill": the parent's height (previews). */
  height?: "viewport" | "fill";
  children?: ReactNode;
};

/**
 * The root of a new-look screen: ui background and text colour, 17 px body,
 * the kit fonts, native controls in the palette's colour scheme. Stack a
 * <TopBar>, the content, then a <BottomActionBar> inside it.
 */
export function Screen({ height = "viewport", className, children, ...rest }: ScreenProps) {
  return (
    <div
      {...rest}
      className={cx(
        "flex flex-col bg-ui-bg text-ui-base [color-scheme:var(--ui-color-scheme)]",
        UI_TEXT,
        height === "viewport" ? "min-h-dvh" : "min-h-full",
        className,
      )}
    >
      {children}
    </div>
  );
}
