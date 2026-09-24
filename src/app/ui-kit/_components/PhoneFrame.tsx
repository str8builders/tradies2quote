import type { ReactNode } from "react";

/**
 * A 390 px phone-width preview. The frame is a containing block for fixed
 * parts (translateZ), so a screen's toasts appear inside its own frame, and
 * the screen scrolls inside it so its sticky bars behave as on a phone.
 */
export function PhoneFrame({
  title,
  caption,
  screenshotId,
  children,
}: {
  title: string;
  caption: string;
  /** Stable hook for scripts/ui-screens.mjs element screenshots. */
  screenshotId: string;
  children: ReactNode;
}) {
  return (
    <figure data-screenshot={screenshotId} className="flex w-full max-w-[390px] flex-col items-center gap-3">
      <div className="relative h-[min(46rem,82dvh)] w-full overflow-hidden rounded-ui-xl border-2 border-ui-line-strong bg-ui-bg shadow-ui-raised [transform:translateZ(0)]">
        <div className="h-full overflow-y-auto overscroll-contain">{children}</div>
      </div>
      <figcaption className="text-center">
        <strong className="block text-ui-base text-ui-text">{title}</strong>
        <span className="text-ui-sm text-ui-muted">{caption}</span>
      </figcaption>
    </figure>
  );
}
