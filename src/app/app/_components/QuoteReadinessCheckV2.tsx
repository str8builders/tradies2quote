import type { ReactNode } from "react";
import { CheckCircle, Warning, WarningOctagon } from "@phosphor-icons/react/dist/ssr";
import { Callout, type CalloutTone } from "@/components/ui/callout";
import type { ReadinessItem, ReadinessStatus, ReadinessSummary } from "@/lib/quote-readiness";

const BANNER: Record<ReadinessSummary["status"], { tone: CalloutTone; title: string }> = {
  ready: { tone: "ok", title: "Ready to send" },
  review: { tone: "warn", title: "Worth a check before you send" },
  missing: { tone: "bad", title: "Some details are missing" },
};

/** Each item's mark, and the same thing in words for screen readers. */
const ITEM: Record<ReadinessStatus, { icon: ReactNode; words: string }> = {
  complete: { icon: <CheckCircle weight="fill" className="text-ui-ok" />, words: "Done" },
  warning: { icon: <Warning weight="fill" className="text-ui-warn" />, words: "To check" },
  missing: { icon: <WarningOctagon weight="fill" className="text-ui-bad" />, words: "Missing" },
};

/** "9 of 12 done, 2 to check, 1 missing." */
function tally({ ready, review, missing, total }: ReadinessSummary): string {
  const parts = [`${ready} of ${total} done`];
  if (review > 0) parts.push(`${review} to check`);
  if (missing > 0) parts.push(`${missing} missing`);
  return `${parts.join(", ")}.`;
}

/**
 * The readiness list in the new look (QuoteReadinessCheck look="new"): the
 * same checks, status and test ids, as a callout and one row per check.
 * Like the classic panel it never blocks sending.
 */
export function QuoteReadinessCheckV2({ items, summary }: { items: ReadinessItem[]; summary: ReadinessSummary }) {
  const banner = BANNER[summary.status];
  return (
    <section data-testid="quote-readiness" data-readiness-status={summary.status} className="space-y-3">
      <Callout tone={banner.tone} title={<span data-testid="readiness-banner-title">{banner.title}</span>}>
        {tally(summary)}
      </Callout>
      <ul className="divide-y divide-ui-line">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`readiness-item-${item.id}`}
            data-readiness-item-status={item.status}
            className="flex items-start gap-3 py-3"
          >
            <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 text-[1.25rem]">
              {ITEM[item.status].icon}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">
                <span className="sr-only">{ITEM[item.status].words}: </span>
                {item.label}
              </p>
              {item.detail ? <p className="text-ui-sm text-ui-muted">{item.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-ui-sm text-ui-muted">You can send at any time. This list is a reminder, not a block.</p>
    </section>
  );
}
