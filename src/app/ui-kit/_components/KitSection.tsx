import type { ReactNode } from "react";
import { SectionTitle } from "@/components/ui/section-title";
import { cx } from "@/components/ui/cx";

/** One section of the kit page: plain title, a line of words, the demos. */
export function KitSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cx("scroll-mt-20 border-t border-ui-line py-10", className)}
    >
      <SectionTitle id={`${id}-title`} description={description}>
        {title}
      </SectionTitle>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A labelled box holding one demo. */
export function Demo({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-ui-lg border border-ui-line bg-ui-surface p-4", className)}>
      <p className="mb-3 text-ui-sm font-semibold text-ui-muted">{label}</p>
      {children}
    </div>
  );
}
