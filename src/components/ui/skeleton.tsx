import type { CSSProperties } from "react";
import { cx } from "./cx";

export interface SkeletonProps {
  /** "line" for a row of text, "block" for a card or image, "circle" for an avatar. */
  shape?: "line" | "block" | "circle";
  /** Size it with width/height classes (w-32, h-24 …). */
  className?: string;
  style?: CSSProperties;
}

/**
 * A grey placeholder while something loads. Hidden from screen readers — put
 * `aria-busy="true"` on the region that is loading. Its gentle pulse stops
 * for reduced motion.
 */
export function Skeleton({ shape = "block", className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      data-skeleton={shape}
      style={style}
      className={cx(
        "block bg-ui-surface-2 animate-ui-pulse motion-reduce:animate-none",
        shape === "circle" ? "rounded-full" : shape === "line" ? "h-4 rounded-ui-sm" : "rounded-ui-md",
        className,
      )}
    />
  );
}
