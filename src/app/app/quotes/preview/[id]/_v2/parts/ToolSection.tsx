import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { TAP } from "@/components/ui/styles";

/**
 * One tool in the "More tools" drawer: a 56 px row that opens in place.
 * Native <details>, so it works before the page's script loads and keeps
 * whatever is inside mounted once opened.
 */
export function ToolSection({
  id,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={`tool-${id}`}
      data-tool={id}
      open={defaultOpen || undefined}
      className="group rounded-ui-lg border border-ui-line bg-ui-surface shadow-ui-card"
    >
      <summary
        className={cx(
          "ui-focus-ring flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-ui-lg px-4 py-3 [&::-webkit-details-marker]:hidden",
          TAP,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ui-text">{title}</span>
          {subtitle ? <span className="block text-ui-sm text-ui-muted">{subtitle}</span> : null}
        </span>
        <CaretDown
          aria-hidden="true"
          weight="bold"
          className="shrink-0 text-[1.25rem] text-ui-faint transition-transform duration-ui-fast ease-ui-out group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {/* The tools inside are still the old look: a dark panel in outdoor mode (globals.css safety net). */}
      <div data-legacy-body="" className="border-t border-ui-line px-4 pt-3 pb-4">
        {children}
      </div>
    </details>
  );
}
