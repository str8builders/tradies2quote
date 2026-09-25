import { cx } from "@/components/ui/cx";

const SIZE = {
  md: "h-11 w-11 text-ui-lg",
  lg: "h-16 w-16 text-ui-2xl",
} as const;

/**
 * Your photo, or your initial on the orange gradient, inside an orange
 * ring. Decorative: the button or heading next to it carries the words.
 */
export function Avatar({
  avatarUrl,
  letter,
  size = "md",
}: {
  avatarUrl: string | null;
  letter: string;
  size?: keyof typeof SIZE;
}) {
  const ring = "ring-2 ring-ui-brand ring-offset-2 ring-offset-ui-bg";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- public storage URL, no optimiser
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        width={size === "lg" ? 64 : 44}
        height={size === "lg" ? 64 : 44}
        className={cx("shrink-0 rounded-full object-cover", SIZE[size], ring)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "ui-brand-gradient ui-heading inline-flex shrink-0 items-center justify-center rounded-full text-ui-on-brand",
        SIZE[size],
        ring,
      )}
    >
      {letter}
    </span>
  );
}
