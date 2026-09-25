import type { ReactNode } from "react";
import { cx } from "./cx";
import { ICON_CHIP, type IconTone } from "./styles";

export type IconTileSize = "sm" | "md" | "lg";

const SIZE: Record<IconTileSize, string> = {
  sm: "h-9 w-9 rounded-ui-sm text-[1.25rem]",
  md: "h-10 w-10 rounded-ui-md text-[1.375rem]",
  lg: "h-14 w-14 rounded-ui-lg text-[1.875rem]",
};

/**
 * A rounded square behind a Phosphor icon, tinted by what it stands for
 * (see IconTone). Pass the icon with `weight="duotone"`: its soft second
 * layer picks up the tile's colour. Decorative; the row or button around it
 * carries the words.
 */
export function IconTile({
  icon,
  tone = "neutral",
  size = "md",
  className,
}: {
  icon: ReactNode;
  tone?: IconTone;
  size?: IconTileSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cx("inline-flex shrink-0 items-center justify-center", SIZE[size], ICON_CHIP[tone], className)}
    >
      {icon}
    </span>
  );
}
